<p align="center">
  <h1 align="center">📋 JBoss Log Analyzer — EAP 6.4</h1>
  <p align="center">
    <strong>Analisador visual de logs do JBoss EAP 6.4 — 100% client-side, sem dependências.</strong>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/Zero_Dependencies-0D1117?style=flat-square" alt="Zero Dependencies">
  </p>
</p>

---

## 🇧🇷 Português

### Sobre

Ferramenta web para análise visual de arquivos de log do **JBoss EAP 6.4**. Funciona inteiramente no navegador — nenhum dado sai da sua máquina. Basta arrastar o arquivo `.log` e explorar os dados com filtros, gráficos e detecção automática de anomalias.

### ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **📂 Drag & Drop** | Arraste arquivos `.log` ou `.txt` diretamente na interface |
| **📊 Dashboard** | Cards com contagem por nível: Info, Warning, Error, Outros |
| **🔍 Busca e Exclusão** | Pesquise por texto/código/módulo e exclua palavras-chave |
| **⏰ Filtro por Período** | Filtre por intervalo de horário (HH:MM) |
| **📈 Timeline** | Gráfico de barras empilhadas por minuto (lazy load) |
| **🔥 Heatmaps** | Estilo GitHub — mapas de calor por hora para Errors, Info e Warnings |
| **🚨 Detecção de Anomalias** | Motor estatístico com Z-Score detecta Spikes, Concentrações, Rajadas e Silêncios |
| **📥 Exportação JSON** | Clique em qualquer célula do heatmap para exportar dados daquela hora em JSON (pronto para análise com IA) |
| **🔎 Detalhes Expansíveis** | Clique em qualquer entrada da tabela para ver a mensagem completa e stacktrace |

### 🚨 Tipos de Anomalia Detectados

| Tipo | O que detecta |
|---|---|
| **SPIKE** | Hora com contagem significativamente acima da média (Z-Score > 2) |
| **CONCENTRATION** | Mais de 70% dos registros de uma hora vindos de um único módulo/source |
| **BURST** | Um minuto específico com 5x ou mais registros que seus vizinhos |
| **SILENCE** | Hora sem nenhum log entre horas ativas (possível crash ou reinício) |

### 🚀 Como Usar

1. Abra o `index.html` em qualquer navegador moderno
2. Arraste um arquivo `.log` do JBoss EAP 6.4 para a área de upload (ou clique para selecionar)
3. Explore o dashboard, filtre por nível, busque texto, ajuste o intervalo de tempo
4. Carregue o gráfico de timeline clicando em "Carregar Gráfico"
5. Analise os heatmaps e o painel de anomalias detectadas
6. Clique em uma célula do heatmap para exportar os dados em JSON

### 📁 Estrutura do Projeto

```
log_analyzer/
├── index.html          # Página principal (dashboard, upload, tabela, heatmaps)
├── app.js              # Motor principal (parser, filtros, charts, anomalias)
├── styles.css          # Design system (dark mode, componentes, animações)
└── jboss_server.log    # Arquivo de exemplo para testes
```

### 🔧 Requisitos

- Navegador moderno (Chrome, Firefox, Edge, Safari)
- **Sem servidor. Sem instalação. Sem dependências.**

---

## 🇺🇸 English

### About

A web-based tool for visually analyzing **JBoss EAP 6.4** log files. Runs entirely in the browser — no data ever leaves your machine. Just drag your `.log` file and explore the data with filters, charts, and automatic anomaly detection.

### ✨ Features

| Feature | Description |
|---|---|
| **📂 Drag & Drop** | Drag `.log` or `.txt` files directly into the UI |
| **📊 Dashboard** | Stat cards with counts per level: Info, Warning, Error, Others |
| **🔍 Search & Exclude** | Search by text/code/module and exclude keywords |
| **⏰ Time Range Filter** | Filter by time range (HH:MM) |
| **📈 Timeline** | Stacked bar chart per minute bucket (lazy loaded) |
| **🔥 Heatmaps** | GitHub-style hourly heatmaps for Errors, Info, and Warnings |
| **🚨 Anomaly Detection** | Statistical engine using Z-Score detects Spikes, Concentrations, Bursts, and Silences |
| **📥 JSON Export** | Click any heatmap cell to export that hour's data as JSON (AI-analysis ready) |
| **🔎 Expandable Details** | Click any table row to expand the full message and stacktrace |

### 🚨 Anomaly Types Detected

| Type | What it detects |
|---|---|
| **SPIKE** | Hour with count significantly above average (Z-Score > 2) |
| **CONCENTRATION** | Over 70% of an hour's entries coming from a single source/module |
| **BURST** | A specific minute with 5x or more entries than its neighbors |
| **SILENCE** | An hour with zero logs between active hours (possible crash or restart) |

### 🚀 How to Use

1. Open `index.html` in any modern browser
2. Drag a JBoss EAP 6.4 `.log` file into the upload area (or click to select)
3. Explore the dashboard, filter by level, search text, adjust the time range
4. Load the timeline chart by clicking "Carregar Gráfico" (Load Chart)
5. Analyze the heatmaps and the detected anomalies panel
6. Click a heatmap cell to export that hour's data as JSON

### 📁 Project Structure

```
log_analyzer/
├── index.html          # Main page (dashboard, upload, table, heatmaps)
├── app.js              # Core engine (parser, filters, charts, anomaly detection)
├── styles.css          # Design system (dark mode, components, animations)
└── jboss_server.log    # Sample log file for testing
```

### 🔧 Requirements

- Modern browser (Chrome, Firefox, Edge, Safari)
- **No server. No installation. Zero dependencies.**

---

## 📄 License

MIT

