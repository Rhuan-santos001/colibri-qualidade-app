#!/usr/bin/env python3
r"""
Gestão da Qualidade - Importação diária de LOTE / ORDEM / COD ITEM
====================================================================
Lê o relatório exportado do sistema (ex: 2707.xls, no formato
"RELATÓRIO DE ORDENS DE PRODUÇÃO COM LOTE" - na verdade é um HTML
salvo com extensão .xls, é normal, o script já lida com isso) e
sincroniza no Supabase:

  - tabela `lotes`   (número do lote)
  - tabela `pecas`   (código do item)
  - tabela `ordens`  (número da ordem de fabricação, ligada a 1 lote e
                       1 peça — é essa tabela que permite o app puxar a
                       peça automaticamente quando o inspetor escolhe a
                       ordem)

Uso:
    python atualizar_lotes_ordens_pecas.py                   # usa o arquivo de hoje (ddmm.xls) na pasta atual
    python atualizar_lotes_ordens_pecas.py caminho\2707.xls  # usa um arquivo específico
    python atualizar_lotes_ordens_pecas.py --dry-run         # só mostra o que faria, não grava no banco
    python atualizar_lotes_ordens_pecas.py --pasta "C:\Exports"  # procura o arquivo de hoje nessa pasta

Configuração necessária (arquivo .env na mesma pasta do script,
veja .env.example):
    SUPABASE_URL=https://SEU-PROJETO.supabase.co
    SUPABASE_SERVICE_KEY=chave-service-role-aqui (NÃO é a anon key!)

Diferença em relação à versão anterior (atualizar_lotes_pecas.py):
    - Agora também lê a coluna da ORDEM DE FABRICAÇÃO do relatório.
    - Em vez da tabela de vínculo solta `lote_peca`, grava em `ordens`
      (numero, lote_id, peca_id) — cada ordem aponta pra exatamente um
      lote e uma peça, que é a relação real do ERP e é o que o app de
      qualidade precisa pra, ao selecionar a Ordem, preencher a Peça
      sozinho.
    - Se a mesma ORDEM aparecer no relatório apontando pra peças
      diferentes (dado inconsistente), o script avisa e usa a última
      ocorrência - confira o aviso se isso acontecer.
"""

import argparse
import os
import re
import sys
from datetime import datetime

import pandas as pd
import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------

CHUNK_SIZE = 500  # quantos registros mandar por requisição

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Nomes de coluna aceitos para "Ordem" no relatório. Se o seu relatório
# usar um nome diferente, adicione aqui (ou o fallback por posição
# assume que é a primeira coluna, ajuste COL_ORDEM_POSICAO se não for).
NOMES_COL_ORDEM = ("ORDEM", "Nº ORDEM", "NUMERO ORDEM", "NRO ORDEM", "ORDEM DE PRODUCAO", "ORDEM PRODUCAO", "OP", "Nº OP")
COL_ORDEM_POSICAO = 0  # usado só se nenhum nome acima for encontrado


def validar_config():
    if not SUPABASE_URL or "SEU-PROJETO" in SUPABASE_URL:
        sys.exit(
            "ERRO: SUPABASE_URL não configurada.\n"
            "Copie .env.example para .env e preencha com os dados do seu projeto."
        )
    if not SUPABASE_SERVICE_KEY or "AQUI" in SUPABASE_SERVICE_KEY:
        sys.exit(
            "ERRO: SUPABASE_SERVICE_KEY não configurada.\n"
            "Copie .env.example para .env e preencha com a chave service_role\n"
            "(Supabase > Project Settings > API > service_role secret).\n"
            "NÃO é a mesma chave 'anon' usada no site."
        )


def headers(prefer=None):
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


# ---------------------------------------------------------------
# Localizar o arquivo do dia
# ---------------------------------------------------------------

def achar_arquivo_do_dia(pasta):
    hoje = datetime.now().strftime("%d%m")
    candidatos = [f"{hoje}.xls", f"{hoje}.xlsx"]
    for nome in candidatos:
        caminho = os.path.join(pasta, nome)
        if os.path.exists(caminho):
            return caminho
    sys.exit(
        f"ERRO: não encontrei nenhum dos arquivos {candidatos} na pasta '{pasta}'.\n"
        f"Exporte o relatório de hoje com esse nome, ou informe o caminho manualmente:\n"
        f"  python atualizar_lotes_ordens_pecas.py caminho\\do\\arquivo.xls"
    )


# ---------------------------------------------------------------
# Ler e limpar o relatório
# ---------------------------------------------------------------

def _normaliza_numero(valor):
    """'12345.0' / 12345.0 / ' 12345 ' -> '12345' (mantém texto se não for número)."""
    if pd.isna(valor):
        return None
    try:
        return str(int(float(valor)))
    except (ValueError, TypeError):
        texto = str(valor).strip()
        return texto or None


def ler_relatorio(caminho):
    print(f"Lendo {caminho} ...")

    if not os.path.exists(caminho):
        sys.exit(f"ERRO: arquivo não encontrado: {caminho}")

    # O arquivo é HTML salvo com extensão .xls (comum em exportações
    # de ERP). Tentamos algumas codificações comuns pra evitar erro
    # de acentuação.
    tabelas = None
    ultimo_erro = None
    for encoding in ("ISO-8859-1", "utf-8", "cp1252"):
        try:
            tabelas = pd.read_html(caminho, encoding=encoding, header=0)
            break
        except Exception as e:
            ultimo_erro = e
            continue

    if tabelas is None:
        print(f"\nDetalhe técnico do erro: {type(ultimo_erro).__name__}: {ultimo_erro}\n")

        try:
            with open(caminho, "rb") as f:
                bruto = f.read(600)
            print("Prévia dos primeiros bytes do arquivo (pra diagnóstico):")
            print(bruto)
            print()
        except Exception:
            pass

        if "lxml" in str(ultimo_erro).lower() or "parser" in str(ultimo_erro).lower() or "html5lib" in str(ultimo_erro).lower():
            sys.exit(
                "ERRO: falta uma biblioteca de leitura de HTML (lxml/html5lib).\n"
                "Rode este comando e tente de novo:\n\n"
                "    python -m pip install --upgrade lxml html5lib beautifulsoup4\n"
            )
        sys.exit(
            "ERRO: não consegui ler o arquivo como HTML/Excel ('No tables found').\n"
            "Isso geralmente significa que o arquivo não é o relatório HTML\n"
            "esperado (pode ter vindo vazio, truncado, ou em outro formato\n"
            "desta vez). Veja a prévia acima - se não fizer sentido, me manda\n"
            "o arquivo .xls que eu confiro."
        )

    df = tabelas[0]

    # Localiza as colunas pelo NOME (mais seguro caso a ordem mude no
    # relatório), com fallback pra posição (A=Ordem, D=Lote, H=Cod Item,
    # P=Observação) se o nome não bater.
    col_ordem = col_lote = col_peca = col_obs = None
    for col in df.columns:
        nome = str(col).strip().upper()
        if nome in NOMES_COL_ORDEM:
            col_ordem = col
        if nome == "LOTE":
            col_lote = col
        if nome in ("COD ITEM", "CÓD ITEM", "CODITEM"):
            col_peca = col
        if nome.startswith("OBSERVA"):
            col_obs = col

    if col_ordem is None:
        print(
            f"AVISO: não achei a coluna de ORDEM pelo nome (procurei por {NOMES_COL_ORDEM}).\n"
            f"       Usando a coluna na posição {COL_ORDEM_POSICAO} ('{df.columns[COL_ORDEM_POSICAO]}') como Ordem.\n"
            f"       Se estiver errado, rode com --dry-run pra conferir e ajuste NOMES_COL_ORDEM\n"
            f"       ou COL_ORDEM_POSICAO no topo do script."
        )
        col_ordem = df.columns[COL_ORDEM_POSICAO]
    if col_lote is None or col_peca is None:
        print("AVISO: não achei LOTE/COD ITEM pelo nome, usando posição (D e H).")
        col_lote = df.columns[3]
        col_peca = df.columns[7]
    if col_obs is None:
        col_obs = df.columns[15] if len(df.columns) > 15 else None

    total_linhas = len(df)

    # Só entram peças cuja ordem foi "GERADA PELO LOTE" — é o padrão que
    # confirma que aquela peça realmente pertence a esse lote de
    # produção (outras linhas podem ter o mesmo número de LOTE por
    # coincidência/reprocessamento, sem serem parte do lote de verdade).
    PADRAO_OBS = re.compile(r"ORDEM GERADA PELO LOTE\s*(\d+)", re.IGNORECASE)

    if col_obs is None:
        sys.exit("ERRO: não encontrei a coluna OBSERVACAO neste relatório.")

    obs_texto = df[col_obs].astype(str)
    bate_padrao = obs_texto.str.contains("ORDEM GERADA PELO LOTE", case=False, na=False)

    trios = df.loc[bate_padrao, [col_ordem, col_lote, col_peca, col_obs]].copy()
    trios.columns = ["ordem", "lote", "peca", "obs"]

    # Normalmente a coluna LOTE já vem preenchida nessas linhas. Em
    # alguns casos raros ela vem em branco mas o número real está
    # escrito na própria observação - aproveitamos esse fallback.
    def resolve_lote(row):
        if pd.notna(row["lote"]):
            return _normaliza_numero(row["lote"])
        m = PADRAO_OBS.search(str(row["obs"]))
        return m.group(1) if m else None

    trios["lote"] = trios.apply(resolve_lote, axis=1)
    trios["ordem"] = trios["ordem"].apply(_normaliza_numero)
    trios["peca"] = trios["peca"].astype(str).str.strip()

    trios = trios.dropna(subset=["ordem", "lote", "peca"])
    trios = trios[(trios["ordem"] != "") & (trios["lote"] != "") & (trios["peca"] != "")]
    trios = trios[["ordem", "lote", "peca"]].drop_duplicates()

    # Uma ORDEM deve apontar pra uma única peça/lote. Se o relatório
    # tiver a mesma ordem com peça/lote diferentes (dado inconsistente
    # no ERP), avisa e mantém só a última ocorrência de cada ordem.
    duplicadas = trios[trios.duplicated(subset=["ordem"], keep=False)]
    if len(duplicadas):
        n_ordens_conflito = duplicadas["ordem"].nunique()
        print(f"AVISO: {n_ordens_conflito} ordem(ns) aparecem mais de uma vez com lote/peça diferentes.")
        print("       Mantendo a última ocorrência de cada uma. Exemplos:")
        print(duplicadas.sort_values("ordem").head(10).to_string(index=False))
        trios = trios.drop_duplicates(subset=["ordem"], keep="last")

    print(f"  {total_linhas} linhas no relatório")
    print(f"  {bate_padrao.sum()} linhas com o padrão 'ORDEM GERADA PELO LOTE'")
    print(f"  {len(trios)} ordens únicas após o filtro")
    print(f"  {trios['lote'].nunique()} lotes distintos")
    print(f"  {trios['peca'].nunique()} peças distintas")

    return trios


# ---------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------

def em_blocos_de(lista, tamanho):
    for i in range(0, len(lista), tamanho):
        yield lista[i:i + tamanho]


def upsert_lotes(numeros):
    print(f"Enviando {len(numeros)} lotes...")
    url = f"{SUPABASE_URL}/rest/v1/lotes?on_conflict=numero"
    for bloco in em_blocos_de(numeros, CHUNK_SIZE):
        payload = [{"numero": n} for n in bloco]
        r = requests.post(
            url, headers=headers("resolution=merge-duplicates,return=minimal"), json=payload
        )
        if r.status_code >= 300:
            sys.exit(f"ERRO ao inserir lotes: {r.status_code} - {r.text}")


def upsert_pecas(codigos):
    print(f"Enviando {len(codigos)} peças...")
    url = f"{SUPABASE_URL}/rest/v1/pecas?on_conflict=codigo"
    for bloco in em_blocos_de(codigos, CHUNK_SIZE):
        payload = [{"codigo": c} for c in bloco]
        r = requests.post(
            url, headers=headers("resolution=merge-duplicates,return=minimal"), json=payload
        )
        if r.status_code >= 300:
            sys.exit(f"ERRO ao inserir peças: {r.status_code} - {r.text}")


def buscar_ids(tabela, coluna, valores):
    """Busca os IDs de uma lista de valores, em blocos (evita URL gigante)."""
    mapa = {}
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    for bloco in em_blocos_de(valores, 200):
        lista_pg = ",".join(bloco)
        params = {"select": f"id,{coluna}", coluna: f"in.({lista_pg})"}
        r = requests.get(url, headers=headers(), params=params)
        if r.status_code >= 300:
            sys.exit(f"ERRO ao buscar {tabela}: {r.status_code} - {r.text}")
        for row in r.json():
            mapa[row[coluna]] = row["id"]
    return mapa


def upsert_ordens(registros):
    """registros: lista de dicts {numero, lote_id, peca_id}"""
    print(f"Enviando {len(registros)} ordens...")
    url = f"{SUPABASE_URL}/rest/v1/ordens?on_conflict=numero"
    for bloco in em_blocos_de(registros, CHUNK_SIZE):
        r = requests.post(
            url, headers=headers("resolution=merge-duplicates,return=minimal"), json=bloco
        )
        if r.status_code >= 300:
            sys.exit(f"ERRO ao inserir ordens: {r.status_code} - {r.text}")


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Importa LOTE/ORDEM/COD ITEM do relatório diário pro Supabase")
    parser.add_argument("arquivo", nargs="?", help="Caminho do arquivo .xls exportado (opcional)")
    parser.add_argument("--pasta", default=".", help="Pasta onde procurar o arquivo do dia (se não passar 'arquivo')")
    parser.add_argument("--dry-run", action="store_true", help="Só mostra o que seria feito, não grava no banco")
    args = parser.parse_args()

    caminho = args.arquivo or achar_arquivo_do_dia(args.pasta)
    trios = ler_relatorio(caminho)

    if args.dry_run:
        print("\n--dry-run ativado: nada foi gravado no banco. Amostra dos dados lidos:")
        print(trios.head(15).to_string(index=False))
        return

    validar_config()

    numeros_lote = sorted(trios["lote"].unique().tolist())
    codigos_peca = sorted(trios["peca"].unique().tolist())

    upsert_lotes(numeros_lote)
    upsert_pecas(codigos_peca)

    print("Buscando IDs gerados...")
    mapa_lote = buscar_ids("lotes", "numero", numeros_lote)
    mapa_peca = buscar_ids("pecas", "codigo", codigos_peca)

    registros_ordens = []
    ignoradas = 0
    for _, row in trios.iterrows():
        lote_id = mapa_lote.get(row["lote"])
        peca_id = mapa_peca.get(row["peca"])
        if lote_id and peca_id:
            registros_ordens.append({"numero": row["ordem"], "lote_id": lote_id, "peca_id": peca_id})
        else:
            ignoradas += 1

    if ignoradas:
        print(f"AVISO: {ignoradas} ordem(ns) ignoradas por falta de lote_id/peca_id (confira os avisos acima).")

    upsert_ordens(registros_ordens)

    print("\nConcluído com sucesso!")
    print(f"  Lotes:  {len(numeros_lote)}")
    print(f"  Peças:  {len(codigos_peca)}")
    print(f"  Ordens: {len(registros_ordens)}")


if __name__ == "__main__":
    main()
