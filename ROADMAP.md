# TheBlockMaster / EQIR — research roadmap

**License:** GPL-3.0 · **Repo:** https://github.com/tuhumar/theblockmaster

A matemática (Double-and-Add, half único em ordem ímpar, ECDLP duro) **já é conhecida**.
O valor deste projeto é a **camada de exploração**: navegar estados, operações, índices,
restrições e hipóteses — o que bibliotecas de produção deliberadamente escondem.

## O que a V1 já entrega

| Capacidade | Status |
|---|---|
| Forward MSB-first com λ / inversos / X,Y | OK |
| Contadores doubles/adds + mapa de bits | OK |
| Reverse half / half(R−G) + ramificações | OK |
| Reconstrução por índices conhecidos | OK |
| Disclaimer ECDLP explícito | OK |
| 100% local (sem enviar keys) | OK |

**Não oferece** (e não deve fingir oferecer): vantagem para recuperar private keys secp256k1.

## Linhas de investigação

### A. Anatomia da multiplicação escalar
- Distribuição de bits / Hamming weight
- Distâncias entre bits ativos
- Coordenadas e resíduos em cada estágio
- Relações entre pontos intermediários \(2^i G\), somas parciais

### B. Reverse engineering matemático
- Motor de estados: half / sub G / decisões bit
- Árvore de caminhos compatíveis vs eliminados
- **Estado = transição**, não só “passo de cálculo”

### C. Correlações entre índices
- Estatísticas automáticas sobre conjuntos de \(k\)
- Correlação índice ↔ coordenadas / λ
- Hipóteses testáveis com contraexemplo

### D. Comparação de algoritmos
| Algoritmo | Objetivo |
|---|---|
| Double-and-Add MSB (V1) | referência |
| Right-to-Left / LSB | comparação de percurso |
| Montgomery Ladder | regularidade |
| Windowed NAF | otimização |
| Fixed Window | pré-computação |

### E. Laboratório de hipóteses
1. Cadastrar propriedade
2. Gerar conjuntos de escalares
3. Executar
4. Comparar
5. Buscar contraexemplos
6. Registrar evidências

## Ambientes (sugestão forte)

Não limitar a secp256k1:

1. **Curvas pequenas** — enumerar todos os pontos / todos os caminhos
2. **secp256k1** — parâmetros reais Bitcoin (V1)
3. **Curvas parametrizáveis** — variar \(p,n,G\) e isolar o que é geral vs particular

## Hipótese-guia de P&D

> Representar cada operação como **transição de estado** (em vez de etapa opaca de cálculo)
> permite identificar invariantes e relações entre caminhos que a representação convencional
> da multiplicação escalar não deixa evidentes.

Métrica: invariantes encontrados + contraexemplos em curvas pequenas + checagem em secp256k1.

## Próximos marcos (ordem sugerida)

1. **V1.1** — árvore visual de ramificações reverse + export JSON reverse
2. **V1.2** — motor Right-to-Left lado a lado com MSB (mesmo \(k\), comparar caminhos)
3. **V2** — curva pequena toy (ex. ordem ~20–40) com enumeração total
4. **V2.1** — painel de hipóteses + runner de contraexemplos
5. **V3** — NAF / window + custos; curvas parametrizáveis

## Anti-objetivos

- Marketing como “quebrador de Bitcoin”
- Misturar aritmética de campo \(p\) com escalares \(n\)
- Apresentar busca incompleta como private key recuperada
