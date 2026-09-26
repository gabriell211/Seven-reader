# Seven Reader

<p align="center">
  <strong>Suíte desktop completa para leitura, edição, criação e processamento profissional de PDFs.</strong>
</p>

<p align="center">
  Read. Edit. Convert. Sign. Protect.
</p>

---

## Visão do produto

O **Seven Reader** é uma aplicação desktop local-first para trabalhar com documentos PDF do início ao fim.

A proposta não é ser somente um visualizador. O aplicativo deve cobrir o fluxo completo de documentos:

- abrir e navegar;
- pesquisar;
- editar texto, imagens, objetos e links;
- organizar e combinar páginas;
- criar PDFs;
- converter formatos;
- digitalizar;
- executar OCR;
- revisar OCR;
- comentar e revisar;
- preencher e criar formulários;
- assinar eletronicamente;
- assinar e certificar com certificados digitais;
- proteger e criptografar;
- redigir conteúdo sensível permanentemente;
- sanitizar documentos;
- compactar e otimizar;
- comparar versões;
- medir;
- preparar documentos acessíveis;
- executar produção gráfica e impressão avançada;
- automatizar tarefas repetitivas;
- processar arquivos em lote.

> **Status:** reconstrução completa a partir do zero. A identidade visual oficial do Seven Reader deve ser preservada. Interface, arquitetura, engine de PDF e fluxos internos serão refeitos.

O Seven Reader é um produto independente. Referências de mercado servem para estudar fluxos de uso e cobertura funcional. Identidade, componentes visuais, ícones, ativos e implementação devem ser próprios.

## Regra de paridade funcional

Todas as ferramentas descritas neste README devem ser **implementadas de verdade e funcionar de ponta a ponta**.

A referência funcional é o comportamento esperado de uma suíte desktop profissional de PDF no nível do Adobe Acrobat atual, incluindo quando aplicável:

- abrir a ferramenta a partir do fluxo correto;
- carregar o documento e o estado necessário;
- exibir todas as opções relevantes;
- permitir preview antes de ações destrutivas;
- validar entradas e permissões;
- executar a operação real sobre o PDF;
- mostrar progresso em operações longas;
- permitir cancelar quando tecnicamente seguro;
- tratar erros de forma compreensível;
- salvar a saída corretamente;
- reabrir o arquivo gerado e preservar o resultado;
- integrar a operação com undo/redo quando fizer sentido;
- manter compatibilidade com outras ferramentas do Seven Reader;
- manter comportamento consistente em Windows e Linux sempre que o sistema operacional permitir.

Não são aceitos:

- botões sem implementação;
- telas demonstrativas;
- placeholders;
- mocks no build de produção;
- ações que apenas alteram a interface sem alterar o PDF;
- recursos marcados como disponíveis que dependem de uma engine ausente;
- conversões falsas;
- exportações incompletas apresentadas como sucesso;
- OCR apenas visual sem camada de texto real;
- redação que apenas desenha um retângulo sobre o conteúdo;
- assinatura que apenas insere uma imagem quando o fluxo exige assinatura digital;
- formulário visual sem persistência real no PDF.

Se uma capacidade depender de biblioteca, codec, driver, scanner, certificado, conversor externo ou recurso específico do sistema operacional, o Seven Reader deve detectar essa capacidade em runtime e explicar claramente a indisponibilidade. A ferramenta não pode fingir que executou a operação.

## Sem IA

O Seven Reader **não terá recursos de inteligência artificial**.

Não incluir:

- assistente de IA;
- chat com PDF;
- resumo por IA;
- edição por linguagem natural;
- geração de conteúdo;
- tradução por IA;
- pesquisa semântica baseada em modelos;
- recursos generativos;
- chamadas para modelos locais ou remotos.

OCR tradicional, reconhecimento de texto, regras determinísticas, indexação, comparação, automações e processamento de documentos continuam permitidos, pois fazem parte do mecanismo documental e não de uma camada de IA generativa.

---

# Objetivos

O Seven Reader deve ser:

- rápido mesmo com PDFs grandes;
- local-first;
- seguro por padrão;
- multiplataforma;
- utilizável sem criar conta;
- funcional offline nos fluxos principais;
- compatível com PDFs reais e complexos;
- simples para leitura casual;
- completo para uso profissional;
- consistente entre ferramentas;
- acessível por teclado e tecnologias assistivas;
- capaz de abrir múltiplos documentos;
- capaz de processar tarefas pesadas sem travar a interface;
- capaz de recuperar sessões após falhas;
- capaz de salvar sem corromper o documento original;
- extensível sem acoplar a interface a uma única engine de PDF.

---

# Stack

O Seven Reader deve seguir a mesma base tecnológica do **Seven Mail**, removendo dependências específicas de e-mail e adicionando somente o necessário para PDF.

## Frontend

- React **19.3+**
- React DOM **19.3+**
- TypeScript **5.9+**
- Vite **8.3+**
- `@vitejs/plugin-react`
- Design system próprio
- CSS moderno
- APIs Tauri para integração nativa

## Desktop

- Tauri **2.11+**
- `@tauri-apps/api` **2.11+**
- `@tauri-apps/cli` **2.11+**
- Rust
- Plugins oficiais do Tauri sempre que possível
- Múltiplas janelas de documentos quando o usuário solicitar, sem separar ferramentas do workspace principal
- File associations
- Drag and drop nativo
- Diálogos nativos
- Notificações nativas
- Atualização automática
- Integração com scanner, impressora, certificados e sistema operacional

## Backend nativo

O Rust é responsável por operações pesadas e sensíveis:

- parsing;
- validação;
- renderização;
- manipulação estrutural;
- leitura e escrita;
- OCR;
- conversão;
- compressão;
- criptografia;
- assinaturas digitais;
- certificados;
- impressão;
- indexação;
- processamento em lote;
- cache;
- filas;
- isolamento de operações arriscadas.

A interface React **não** deve executar processamento pesado de PDF na thread principal.

## Engine de PDF

A engine deve ficar atrás de uma abstração própria.

Requisitos:

- licença compatível com o projeto;
- renderização de PDF 1.x e PDF 2.0;
- suporte a texto, imagens, transparência e fontes;
- extração estruturada;
- edição incremental quando possível;
- suporte a forms, annotations, links, bookmarks e layers;
- renderização por página e por tiles;
- acesso a objetos de baixo nível quando necessário;
- capacidade de salvar sem rasterizar o documento inteiro.

Não acoplar o domínio diretamente a PDFium, MuPDF, Poppler ou qualquer engine específica.

> Dependências AGPL ou comerciais só podem entrar no núcleo após uma decisão explícita de licenciamento.

---

# Princípios de arquitetura

## Local-first

Abrir, ler, editar, assinar, converter, organizar, digitalizar e executar OCR deve funcionar localmente sempre que tecnicamente possível.

Por padrão:

- documentos não são enviados para servidores;
- OCR é local;
- cache é local;
- histórico é local;
- assinaturas ficam no dispositivo;
- chaves privadas não deixam o sistema;
- telemetria é opcional.

## Processamento nativo

Operações pesadas acontecem no backend Rust ou em workers/processos dedicados.

## Operações não destrutivas

Sempre que possível:

- manter o original intacto;
- usar estado transacional;
- trabalhar em cópia temporária;
- oferecer desfazer/refazer;
- usar gravação atômica;
- validar o arquivo salvo;
- manter recuperação após crash.

## Segurança por padrão

PDF é entrada não confiável.

O aplicativo deve tratar como potencialmente hostil:

- JavaScript;
- URLs;
- launch actions;
- anexos;
- formulários;
- mídia;
- fontes;
- objetos 3D;
- arquivos criptografados;
- objetos comprimidos;
- streams malformados;
- documentos corrompidos;
- certificados;
- ações automáticas.

---

# Arquitetura da interface

A interface deve ser organizada por **fluxos completos**, e não por centenas de comandos soltos.

Exemplos de fluxos principais:

- Editar
- Converter
- Criar
- Organizar
- Combinar
- Comentar
- Preencher e assinar
- Certificados
- Digitalizar e OCR
- Preparar formulário
- Proteger
- Redigir
- Comparar
- Otimizar
- Acessibilidade
- Produção de impressão
- Automatizar

---

# Tela inicial

- [ ] Arquivos recentes
- [ ] Favoritos
- [ ] Fixados
- [ ] Recuperar sessão
- [ ] Abrir arquivo
- [ ] Abrir pasta
- [ ] Criar PDF
- [ ] Combinar arquivos
- [ ] Digitalizar
- [ ] Converter
- [ ] OCR
- [ ] Compactar
- [ ] Assinar
- [ ] Ferramentas recentes
- [ ] Tarefas recentes
- [ ] Drag and drop
- [ ] Histórico local opcional
- [ ] Limpar recentes
- [ ] Abrir localização do arquivo
- [ ] Remover item da lista sem apagar o arquivo

---

# Workspace do documento

## Estrutura

A janela do documento deve possuir:

- menu principal;
- barra global;
- abas;
- painel "Todas as ferramentas";
- painel da ferramenta ativa;
- documento central;
- barra flutuante de ferramentas rápidas;
- painéis laterais;
- navegação;
- zoom;
- número da página;
- estado do documento;
- pesquisa;
- menus contextuais;
- notificações de segurança;
- status de tarefas em background.

## Menu principal

No Windows, deve concentrar ações equivalentes a:

- Arquivo
- Editar
- Exibir
- Preferências
- Propriedades
- Ajuda

No macOS, respeitar convenções nativas de menu.

## Barra global

Separar claramente:

### Ferramentas do documento

- Todas as ferramentas
- Editar
- Converter
- Assinar
- Comentar
- Criar

### Ações do arquivo

- Abrir
- Salvar
- Salvar como
- Imprimir
- Pesquisar
- Compartilhar/exportar
- Desfazer
- Refazer
- Propriedades

## Pesquisa global

Um único campo deve conseguir procurar:

- texto no documento;
- comandos;
- ferramentas;
- páginas;
- marcadores;
- comentários;
- campos de formulário.

## Todas as ferramentas

Um ponto único para descobrir todas as ferramentas.

Categorias:

- Visualizar
- Editar
- Organizar páginas
- Combinar arquivos
- Converter
- Criar PDF
- Digitalizar e OCR
- Comentar
- Preencher e assinar
- Solicitar assinaturas
- Certificados
- Preparar formulário
- Proteger
- Redigir
- Otimizar
- Comparar
- Medir
- Acessibilidade
- Produção de impressão
- Ações guiadas
- JavaScript e ações PDF
- Portfólios PDF
- Camadas
- Artigos PDF
- Índices e Catálogo
- Rich Media
- 3D
- Revisão compartilhada
- Ferramentas geoespaciais

## Ferramentas rápidas

Widget flutuante e personalizável.

Ferramentas padrão:

- Seleção
- Mão
- Comentário
- Destaque
- Sublinhado
- Tachado
- Desenho
- Texto
- Preenchimento
- Assinatura
- Borracha

Personalização:

- [ ] adicionar
- [ ] remover
- [ ] reordenar
- [ ] fixar
- [ ] mover livremente
- [ ] restaurar padrão
- [ ] memorizar layout por usuário

## Painéis laterais

Painéis configuráveis e ocultáveis.

Possíveis painéis:

- Miniaturas
- Marcadores
- Comentários
- Anexos
- Camadas
- Assinaturas
- Tags
- Ordem de leitura
- Campos
- Resultados de busca
- Tarefas

O usuário deve poder:

- [ ] mostrar/ocultar
- [ ] reordenar quando possível
- [ ] recolher
- [ ] restaurar configuração padrão

## Painel direito inferior

Acesso rápido a:

- página atual;
- página total;
- zoom;
- ajustar página;
- ajustar largura;
- tamanho real;
- página única;
- rolagem contínua;
- duas páginas;
- duas páginas contínuas;
- marquee zoom;
- zoom dinâmico.

## Documento central

- zoom inicial inteligente;
- menus contextuais conforme seleção;
- seleção de texto;
- seleção de imagem;
- seleção de objeto;
- drag and drop;
- cursores contextuais;
- feedback visual de edição;
- overlays de OCR, forms, comentários e acessibilidade.

---

# Leitura e visualização

## Renderização

- [ ] PDF 1.x
- [ ] PDF 2.0
- [ ] antialiasing
- [ ] texto vetorial nítido
- [ ] imagens de alta resolução
- [ ] transparência
- [ ] blend modes
- [ ] máscaras
- [ ] gradientes
- [ ] padrões
- [ ] fontes incorporadas
- [ ] subset fonts
- [ ] font fallback
- [ ] ICC profiles
- [ ] DeviceRGB
- [ ] DeviceCMYK
- [ ] DeviceGray
- [ ] spot colors
- [ ] CropBox
- [ ] MediaBox
- [ ] TrimBox
- [ ] BleedBox
- [ ] ArtBox
- [ ] rotação
- [ ] páginas com tamanhos diferentes

## Navegação

- [ ] Próxima página
- [ ] Página anterior
- [ ] Primeira página
- [ ] Última página
- [ ] Ir para página
- [ ] Histórico de navegação
- [ ] Voltar à visualização anterior
- [ ] Avançar à visualização seguinte
- [ ] Rolagem contínua
- [ ] Página única
- [ ] Duas páginas
- [ ] Duas páginas contínuas
- [ ] Ajustar página
- [ ] Ajustar largura
- [ ] Tamanho real
- [ ] Zoom +
- [ ] Zoom -
- [ ] Zoom por seleção
- [ ] Zoom dinâmico
- [ ] Lupa
- [ ] Pan/Mão
- [ ] Rotação visual
- [ ] Tela cheia
- [ ] Modo leitura
- [ ] Modo apresentação
- [ ] Reflow quando o PDF permitir

## Réguas, grades e guias

- [ ] Régua horizontal
- [ ] Régua vertical
- [ ] Grade
- [ ] Snap na grade
- [ ] Guias
- [ ] Coordenadas do cursor
- [ ] Unidades configuráveis

---

# Abas e múltiplas janelas

- [ ] Abrir vários PDFs em abas
- [ ] Reordenar abas
- [ ] Fechar aba
- [ ] Fechar outras
- [ ] Reabrir fechada
- [ ] Próxima aba
- [ ] Aba anterior
- [ ] Abrir em nova janela
- [ ] Mover para nova janela
- [ ] Abrir dois documentos lado a lado
- [ ] Restaurar sessão
- [ ] Memorizar posição e zoom por documento
- [ ] Detectar arquivo alterado externamente

---

# Pesquisa

## Busca simples

- [ ] Texto
- [ ] Próximo resultado
- [ ] Resultado anterior
- [ ] Total de ocorrências
- [ ] Destaques no documento

## Busca avançada

- [ ] Maiúsculas/minúsculas
- [ ] Palavra inteira
- [ ] Intervalo de páginas
- [ ] Comentários
- [ ] Marcadores
- [ ] Campos
- [ ] Anexos textuais
- [ ] Texto OCR
- [ ] Metadados
- [ ] Índice local
- [ ] Histórico opcional
- [ ] Regex opcional como melhoria própria

---

# Seleção e clipboard

- [ ] Selecionar texto
- [ ] Selecionar bloco
- [ ] Seleção por coluna
- [ ] Selecionar imagem
- [ ] Selecionar objeto
- [ ] Selecionar área
- [ ] Copiar texto
- [ ] Copiar imagem
- [ ] Copiar área como imagem
- [ ] Copiar preservando ordem de leitura
- [ ] Selecionar tudo
- [ ] Criar PDF diretamente da área de transferência

---

# Editar PDF

A edição deve atuar sobre a estrutura real do PDF sempre que possível.

Não converter o documento inteiro em imagens para simular edição.

## Texto

- [ ] Adicionar texto
- [ ] Alterar texto existente
- [ ] Substituir texto
- [ ] Excluir texto
- [ ] Fonte
- [ ] Tamanho
- [ ] Cor
- [ ] Negrito
- [ ] Itálico
- [ ] Sublinhado quando aplicável
- [ ] Espaçamento
- [ ] Alinhamento
- [ ] Rotação
- [ ] Reposicionamento
- [ ] Redimensionamento da caixa
- [ ] Reflow dentro da caixa
- [ ] Listas com marcadores
- [ ] Listas numeradas
- [ ] Fonte padrão
- [ ] Verificação ortográfica
- [ ] Dicionário de palavras aceitas
- [ ] Aviso de fonte ausente
- [ ] Preservação de layout

## Imagens

- [ ] Adicionar
- [ ] Substituir
- [ ] Excluir
- [ ] Recortar
- [ ] Redimensionar
- [ ] Girar
- [ ] Espelhar
- [ ] Reposicionar
- [ ] Opacidade
- [ ] Manter proporção
- [ ] Editar em aplicativo externo opcional
- [ ] Reimportar edição externa

## Objetos

- [ ] Selecionar raster
- [ ] Selecionar vetor
- [ ] Mover
- [ ] Redimensionar
- [ ] Rotacionar
- [ ] Duplicar
- [ ] Excluir
- [ ] Ordem de empilhamento
- [ ] Propriedades
- [ ] Espaço de cor
- [ ] Rendering intent
- [ ] Tags quando aplicável

## Links e destinos

- [ ] Criar link para URL
- [ ] Criar link para página
- [ ] Criar link para arquivo
- [ ] Criar destino nomeado
- [ ] Editar destino
- [ ] Remover destino
- [ ] Alterar área clicável
- [ ] Alterar aparência
- [ ] Mover área
- [ ] Redimensionar área
- [ ] Validar URL
- [ ] Confirmar links externos conforme política de segurança

## Cabeçalho e rodapé

- [ ] Adicionar
- [ ] Atualizar
- [ ] Remover
- [ ] Texto
- [ ] Data
- [ ] Página
- [ ] Total de páginas
- [ ] Margens
- [ ] Intervalo
- [ ] Páginas pares/ímpares
- [ ] Preview

## Numeração de página

- [ ] Número visual
- [ ] Renumerar labels de páginas
- [ ] Prefixo
- [ ] Sufixo
- [ ] Numeração romana
- [ ] Intervalos

## Marca d'água

- [ ] Texto
- [ ] Imagem
- [ ] Rotação
- [ ] Escala
- [ ] Opacidade
- [ ] Posição
- [ ] Intervalo de páginas
- [ ] Adicionar
- [ ] Atualizar
- [ ] Remover

## Plano de fundo

- [ ] Cor
- [ ] Imagem
- [ ] Opacidade
- [ ] Escala
- [ ] Posição
- [ ] Intervalo
- [ ] Adicionar
- [ ] Atualizar
- [ ] Remover

## Numeração Bates

- [ ] Adicionar
- [ ] Prefixo
- [ ] Sufixo
- [ ] Dígitos
- [ ] Número inicial
- [ ] Aplicar em lote
- [ ] Adicionar ao nome do arquivo
- [ ] Remover
- [ ] Pesquisar por número Bates

---

# Organizar páginas

## Visualização

- [ ] Miniaturas grandes
- [ ] Seleção múltipla
- [ ] Ctrl/Cmd + clique
- [ ] Shift + clique
- [ ] Drag and drop
- [ ] Menu contextual
- [ ] Preview antes de aplicar

## Operações

- [ ] Reordenar
- [ ] Recortar
- [ ] Copiar
- [ ] Colar
- [ ] Duplicar
- [ ] Excluir
- [ ] Girar
- [ ] Recortar página
- [ ] Redimensionar página
- [ ] Substituir
- [ ] Renumerar
- [ ] Extrair
- [ ] Dividir

## Inserir

Inserir páginas de:

- [ ] arquivo
- [ ] outro PDF
- [ ] imagem
- [ ] clipboard
- [ ] scanner
- [ ] página web
- [ ] página em branco

Permitir inserir:

- antes da primeira;
- depois da primeira;
- antes da última;
- depois da última;
- antes de página específica;
- depois de página específica.

## Mover e copiar entre documentos

- [ ] Abrir dois PDFs lado a lado
- [ ] Tile vertical/horizontal
- [ ] Selecionar uma ou várias páginas
- [ ] Arrastar páginas para outro PDF para mover
- [ ] Copiar e colar páginas entre PDFs
- [ ] Preservar conteúdo, campos, comentários e links compatíveis
- [ ] Atualizar os dois documentos sem corromper o original
- [ ] Undo antes do salvamento quando tecnicamente seguro

## Extrair

- [ ] Intervalo
- [ ] Seleção
- [ ] Manter no original
- [ ] Excluir do original após extrair
- [ ] Criar um PDF único
- [ ] Extrair cada página como arquivo separado
- [ ] Preservar forms/comments/links quando tecnicamente aplicável
- [ ] Informar que bookmarks e article threads associados às páginas podem não acompanhar a extração
- [ ] Validar permissões do documento antes de extrair

## Dividir

Dividir por:

- [ ] número máximo de páginas
- [ ] tamanho máximo do arquivo
- [ ] marcadores de nível superior

Opções:

- [ ] vários arquivos de entrada
- [ ] pasta de saída
- [ ] padrão de nome
- [ ] preview do plano de divisão

---

# Combinar arquivos

## Entradas

- [ ] PDFs
- [ ] DOC/DOCX
- [ ] XLS/XLSX
- [ ] PPT/PPTX
- [ ] imagens
- [ ] texto
- [ ] páginas web
- [ ] áudio como anexo/objeto compatível
- [ ] vídeo como anexo/objeto compatível
- [ ] arquivos já abertos
- [ ] pastas quando aplicável

## Fluxo

- [ ] Drag and drop
- [ ] Adicionar arquivos
- [ ] Adicionar arquivos abertos
- [ ] Expandir arquivo para ver páginas
- [ ] Reordenar arquivos
- [ ] Reordenar páginas
- [ ] Remover página
- [ ] Remover arquivo
- [ ] Preview
- [ ] Combinar
- [ ] Salvar como novo arquivo

---

# Criar PDF

## Fontes

- [ ] Arquivo
- [ ] Vários arquivos
- [ ] Página em branco
- [ ] Scanner
- [ ] Área de transferência
- [ ] Página web
- [ ] Site com múltiplos níveis
- [ ] Portfólio PDF
- [ ] Imagem
- [ ] Impressora virtual no Windows quando implementável

## Página web para PDF

- [ ] URL
- [ ] HTML local
- [ ] Capturar um nível
- [ ] Capturar N níveis
- [ ] Capturar site inteiro
- [ ] Permanecer no mesmo path
- [ ] Permanecer no mesmo servidor
- [ ] Criar bookmarks
- [ ] Criar tags
- [ ] Cabeçalho com título/URL
- [ ] Rodapé com URL/data
- [ ] Encoding
- [ ] Layout
- [ ] Fila de URLs
- [ ] Adicionar páginas capturadas a PDF existente

## Página em branco

- [ ] Tamanho
- [ ] Orientação
- [ ] Texto estático
- [ ] Imagens
- [ ] Form fields
- [ ] Metadados

---

# Compatibilidade de entrada para criação/conversão

O sistema deve possuir uma camada de capabilities. Formatos que exigem software externo não podem aparecer como suportados se o conversor necessário não estiver disponível.

## Microsoft Office

- [ ] DOC
- [ ] DOCX
- [ ] XLS
- [ ] XLSX
- [ ] PPT
- [ ] PPTX

## Texto

- [ ] TXT
- [ ] RTF

## PostScript

- [ ] PS
- [ ] EPS
- [ ] PRN

## Imagens

- [ ] BMP
- [ ] JPEG/JPG
- [ ] GIF
- [ ] TIFF
- [ ] PNG
- [ ] PCX
- [ ] RLE
- [ ] DIB
- [ ] SVG quando conversor compatível estiver disponível

## Web

- [ ] HTML
- [ ] URL

## OpenDocument / Office alternativo

- [ ] ODT
- [ ] ODP
- [ ] ODS
- [ ] ODG
- [ ] ODF
- [ ] SXW
- [ ] SXI
- [ ] SXC
- [ ] SXD
- [ ] STW

## Formatos avançados/opcionais

- [ ] WPD
- [ ] PSD
- [ ] AI
- [ ] INDD
- [ ] U3D
- [ ] PRC
- [ ] DWG
- [ ] DWT
- [ ] DXF
- [ ] DWF
- [ ] DST
- [ ] XPS
- [ ] MPP
- [ ] VSD

Esses formatos devem usar adapters e detecção de capacidade. Nunca simular suporte quando o conversor real não existir.

---

# Conversão

A conversão deve usar um **workspace integrado à janela principal**, seguindo o mesmo modelo das demais ferramentas. O documento continua visível quando fizer sentido e tarefas longas seguem em background.

## Janela de conversão

- [ ] Painel/workspace integrado à janela principal
- [ ] Drag and drop
- [ ] Vários arquivos
- [ ] Fila
- [ ] Progresso individual
- [ ] Progresso total
- [ ] Pausar
- [ ] Retomar
- [ ] Cancelar
- [ ] Retry
- [ ] Histórico
- [ ] Pasta de saída
- [ ] Abrir pasta
- [ ] Padrão de nomes
- [ ] Sobrescrever
- [ ] Renomear automaticamente
- [ ] Processar em background
- [ ] Notificação ao terminar
- [ ] Log por arquivo
- [ ] Relatório final

## Detecção automática

Ao adicionar um arquivo, detectar:

- formato;
- MIME real;
- páginas;
- tamanho;
- senha;
- scan/imagem;
- texto extraível;
- orientação;
- OCR necessário;
- conversões disponíveis;
- limitações;
- dependências externas.

## PDF para

- [ ] DOCX
- [ ] DOC
- [ ] XLSX
- [ ] XLS
- [ ] PPTX
- [ ] PPT
- [ ] RTF
- [ ] TXT
- [ ] HTML
- [ ] Markdown como extensão própria
- [ ] JPG
- [ ] PNG
- [ ] TIFF
- [ ] BMP
- [ ] PostScript
- [ ] PDF/A
- [ ] PDF/X quando compatível
- [ ] PDF otimizado

## Opções

- [ ] Preservar layout
- [ ] Preservar imagens
- [ ] Preservar tabelas
- [ ] Detectar colunas
- [ ] Preservar links
- [ ] Preservar bookmarks
- [ ] Intervalo
- [ ] DPI
- [ ] Qualidade
- [ ] Compressão
- [ ] OCR automático
- [ ] Idioma OCR
- [ ] Imagens por página
- [ ] Uma imagem por documento
- [ ] Convenção de nomes

---

# Conversão avançada e predefinições

## Presets

- [x] Criar preset
- [x] Duplicar
- [x] Editar
- [x] Excluir
- [x] Importar
- [x] Exportar

## Configurações

- [x] Qualidade de imagem
- [x] Downsampling
- [x] Compressão
- [x] Font embedding
- [x] Subset de fontes
- [x] Perfis ICC
- [x] RGB
- [x] CMYK
- [x] Gray
- [x] Rendering intent
- [x] Preservar overprint
- [x] Metadados
- [x] PDF standards
- [x] Compatibilidade de versão PDF

## Pastas monitoradas

Opcional para desktop profissional:

- [x] Watch folder
- [x] Preset por pasta
- [x] Pasta de entrada
- [x] Pasta de saída
- [x] Log
- [ ] Retry
- [ ] Quarentena de erro

---

# Digitalização

## Entrada

- [ ] Detectar scanners
- [ ] Scanner padrão
- [ ] WIA no Windows quando aplicável
- [ ] TWAIN quando aplicável
- [ ] SANE no Linux quando aplicável
- [ ] Flatbed
- [ ] ADF
- [ ] Frente
- [ ] Frente e verso

## Configurações

- [ ] Cor
- [ ] Grayscale
- [ ] Preto e branco
- [ ] DPI
- [ ] Tamanho da página
- [ ] Qualidade
- [ ] Otimizar imagem
- [ ] Auto crop
- [ ] Deskew
- [ ] Remover páginas em branco
- [ ] Limpeza de fundo

## Saída

- [ ] Criar novo PDF
- [ ] Anexar a PDF
- [ ] Salvar múltiplos PDFs
- [ ] OCR após scan
- [ ] Adicionar metadados
- [ ] Criar PDF/A-1b
- [ ] Scan mais páginas
- [ ] Scan verso
- [ ] Finalizar
- [ ] Reordenar antes de salvar

---

# OCR

## Reconhecimento

- [ ] Página atual
- [ ] Intervalo
- [ ] Documento inteiro
- [ ] Vários documentos
- [ ] Vários idiomas
- [ ] Detecção automática de idioma opcional
- [ ] Detecção de orientação
- [ ] Auto rotate
- [ ] Deskew
- [ ] Despeckle
- [ ] Ajuste de contraste
- [ ] Melhoria de scan
- [ ] Imagem original preservada
- [ ] Camada pesquisável
- [ ] Texto selecionável
- [ ] Texto editável
- [ ] Pasta de saída para lote
- [ ] Padrão de nome

## OCR automático ao editar scan

Ao entrar em modo de edição em um PDF somente imagem:

- detectar que é scan;
- oferecer/aplicar OCR;
- gerar uma cópia editável;
- tentar combinar fonte e formatação;
- preservar o original.

## Revisar texto reconhecido

Fluxo de revisão:

- [ ] Ativar "Revisar texto reconhecido"
- [ ] Marcar palavras suspeitas
- [ ] Mostrar bounding box
- [ ] Mostrar imagem original
- [ ] Mostrar "Reconhecido como"
- [ ] Editar reconhecimento
- [ ] Aceitar
- [ ] Ir automaticamente à próxima suspeita
- [ ] Voltar à anterior
- [ ] Ignorar
- [ ] Encerrar revisão

## Melhoria própria: confidence review

Além do comportamento de suspeitas:

- [ ] Confidence score por palavra
- [ ] Threshold configurável
- [ ] Ordenar do menor confidence para o maior
- [ ] Filtrar por confidence
- [ ] Revisar apenas abaixo do threshold
- [ ] Estatísticas por página
- [ ] Estatísticas do documento

---

# Comentários e revisão

## Texto e marcação

- [ ] Nota adesiva
- [ ] Highlight
- [ ] Underline
- [ ] Strikethrough
- [ ] Inserir texto
- [ ] Substituir texto
- [ ] Caixa de texto
- [ ] Callout
- [ ] Comentário sobre texto selecionado
- [ ] Comentário sobre imagem selecionada

## Desenho

- [ ] Lápis
- [ ] Borracha
- [ ] Linha
- [ ] Seta
- [ ] Retângulo
- [ ] Círculo
- [ ] Polígono
- [ ] Nuvem

## Anexos em comentários

- [ ] Arquivo
- [ ] Áudio quando suportado

## Propriedades

- [ ] Cor
- [ ] Opacidade
- [ ] Espessura
- [ ] Autor
- [ ] Data
- [ ] Estado
- [ ] Bloquear comentário
- [ ] Tornar padrão

## Discussão

- [ ] Responder
- [ ] Resolver
- [ ] Reabrir
- [ ] Marcar como não lido
- [ ] Reações
- [ ] Agrupar comentários
- [ ] Desagrupar

## Lista de comentários

- [ ] Buscar
- [ ] Filtrar
- [ ] Ordenar
- [ ] Próximo
- [ ] Anterior
- [ ] Exportar
- [ ] Importar FDF
- [ ] Importar XFDF
- [ ] Resumo imprimível
- [ ] Verificação ortográfica em comentários

---

# Carimbos

- [ ] Carimbos padrão
- [ ] Carimbo personalizado
- [ ] Categorias
- [ ] Carimbo dinâmico
- [ ] Data
- [ ] Usuário
- [ ] Identidade
- [ ] Editar identidade
- [ ] Excluir customizado
- [ ] Reutilizar carimbo

---

# Formulários PDF

## Preparar formulário

Criar a partir de:

- [ ] PDF existente
- [ ] Documento convertido
- [ ] Página em branco
- [ ] Scanner

## Detecção automática

- [ ] Detectar campos
- [ ] Detectar labels
- [ ] Sugerir tipos
- [ ] Revisar antes de aplicar

## Tipos de campo

- [ ] Text Field
- [ ] Image Field
- [ ] Checkbox
- [ ] Radio
- [ ] Dropdown
- [ ] List Box
- [ ] Button
- [ ] Digital Signature
- [ ] Barcode
- [ ] Date
- [ ] Campo numérico

## Edição de campos

- [ ] Criar
- [ ] Duplicar
- [ ] Copiar
- [ ] Criar múltiplas cópias em linhas e colunas
- [ ] Duplicar campo em todas as páginas
- [ ] Duplicar campo em intervalo de páginas
- [ ] Mover
- [ ] Redimensionar
- [ ] Seleção múltipla
- [ ] Alinhar
- [ ] Distribuir
- [ ] Centralizar
- [ ] Guides
- [ ] Tab order
- [ ] Required
- [ ] Read only
- [ ] Tooltip
- [ ] Nome interno
- [ ] Aparência
- [ ] Fonte
- [ ] Cor
- [ ] Border
- [ ] Visibility
- [ ] Visible
- [ ] Hidden
- [ ] Visible but doesn't print
- [ ] Hidden but printable
- [ ] Orientation
- [ ] Lock properties
- [ ] Usar propriedades atuais como padrão para novos campos
- [ ] Posicionamento numérico preciso
- [ ] Width
- [ ] Height
- [ ] Border color
- [ ] Fill color
- [ ] Line thickness
- [ ] Line style
- [ ] Font size
- [ ] Text color

## Gatilhos e ações de campo

Gatilhos suportados:

- [ ] Mouse Up
- [ ] Mouse Down
- [ ] Mouse Enter
- [ ] Mouse Exit
- [ ] On Focus
- [ ] On Blur

Ações suportadas, sempre submetidas à política de segurança:

- [ ] Execute menu item
- [ ] Go to page view
- [ ] Go to 3D/Multimedia view
- [ ] Import form data
- [ ] Open file
- [ ] Open web link
- [ ] Play sound
- [ ] Play media
- [ ] Read article
- [ ] Reset form
- [ ] Run JavaScript em sandbox
- [ ] Set layer visibility
- [ ] Show/hide field
- [ ] Submit form
- [ ] Ordenar múltiplas ações
- [ ] Editar ação
- [ ] Excluir ação

## Formatação e validação

- [ ] Texto
- [ ] Número
- [ ] Percentual
- [ ] Data
- [ ] Hora
- [ ] Máscara especial
- [ ] Validação
- [ ] Limite de caracteres
- [ ] Multiline
- [ ] Comb

## Cálculos

- [ ] Soma
- [ ] Produto
- [ ] Média
- [ ] Mínimo
- [ ] Máximo
- [ ] Notação simplificada
- [ ] Script customizado
- [ ] Ordem de cálculo
- [ ] Recalcular automaticamente

## JavaScript de formulário

JavaScript nunca deve ser executado sem política de segurança.

- [ ] Document JavaScript
- [ ] Field actions
- [ ] Calculation script
- [ ] Validation script
- [ ] Keystroke script
- [ ] Sandbox/restrições

## Barcodes

- [ ] PDF417
- [ ] QR Code
- [ ] Data Matrix
- [ ] Codificar campos selecionados
- [ ] XML
- [ ] Tab delimited
- [ ] Custom calculation script
- [ ] Preview/teste
- [ ] Decode condition
- [ ] Ajuste de célula

## Dados

- [ ] Importar
- [ ] Exportar
- [ ] FDF
- [ ] XFDF
- [ ] Reset
- [ ] Clear form
- [ ] Autofill local opcional

## Preferências de formulários

- [ ] Calcular valores automaticamente
- [ ] Ajustar tab order automaticamente ao mover/criar/excluir campos
- [ ] Mostrar focus rectangle
- [ ] Mostrar indicador de overflow em campo de texto
- [ ] Preview do campo durante criação/edição
- [ ] Detectar campos automaticamente
- [ ] AutoComplete local configurável

## Compatibilidade

- [ ] AcroForm
- [ ] FDF
- [ ] XFDF
- [ ] XFA somente quando tecnicamente viável
- [ ] Preservação ao salvar

---

# Preencher e assinar

## Preenchimento simples

- [ ] Detectar áreas de preenchimento
- [ ] Inserir texto
- [ ] Checkmark
- [ ] X
- [ ] Dot
- [ ] Data
- [ ] Iniciais
- [ ] Assinatura

## Assinatura eletrônica local

- [ ] Digitar
- [ ] Desenhar
- [ ] Usar imagem
- [ ] Salvar localmente
- [ ] Remover assinatura salva
- [ ] Redimensionar
- [ ] Reposicionar

---

# Solicitação de assinaturas

Módulo opcional online/servidor.

- [ ] Adicionar signatários
- [ ] Ordem de assinatura
- [ ] Campos por signatário
- [ ] Mensagem
- [ ] Prazo
- [ ] Lembretes
- [ ] Envio em massa
- [ ] Tracking
- [ ] Status
- [ ] Cancelar solicitação
- [ ] Baixar contrato final
- [ ] Audit trail

O núcleo local do Seven Reader não deve depender deste módulo.

---

# Certificados e assinaturas digitais

## Digital IDs

- [ ] PKCS#12
- [ ] PFX
- [ ] Certificado do Windows
- [ ] Smart card
- [ ] Hardware token
- [ ] IDs autoassinadas
- [ ] ID padrão
- [ ] Registrar
- [ ] Excluir
- [ ] Alterar senha quando suportado
- [ ] Roaming ID quando houver provider
- [ ] Directory server

## Assinar

- [ ] Approval signature
- [ ] Certify
- [ ] Assinatura visível
- [ ] Assinatura invisível
- [ ] Motivo
- [ ] Local
- [ ] Aparência personalizada
- [ ] Timestamp server
- [ ] Bloquear documento após assinatura
- [ ] Permitir somente preenchimento
- [ ] Permitir comentários
- [ ] Múltiplas assinaturas

## Validar

- [ ] Validar uma assinatura
- [ ] Validar todas
- [ ] Cadeia de confiança
- [ ] Certificado do signatário
- [ ] Timestamp
- [ ] Integridade
- [ ] Alterações posteriores
- [ ] Documento certificado
- [ ] Certificado expirado
- [ ] Trust settings
- [ ] Revocation checking quando disponível
- [ ] OCSP
- [ ] CRL

## Padrões

Quando a biblioteca criptográfica permitir:

- [ ] CMS
- [ ] PKCS#7
- [ ] PAdES
- [ ] CAdES
- [ ] ETSI compatibility
- [ ] XML signatures para XFA somente se XFA for suportado

## Versões assinadas

- [ ] Ver versão assinada
- [ ] Comparar com versão atual
- [ ] Mostrar alterações desde assinatura

---

# Proteção

## Senhas

- [ ] Senha de abertura
- [ ] Senha de permissões
- [ ] Restringir impressão
- [ ] Restringir cópia
- [ ] Restringir edição
- [ ] Restringir comentário
- [ ] Remover segurança com autorização
- [ ] Mostrar permissões atuais

## Criptografia

- [ ] AES compatível com o padrão PDF
- [ ] AES-256 quando aplicável
- [ ] Criptografia por senha
- [ ] Criptografia por certificado
- [ ] Escolher destinatários
- [ ] Permissões por destinatário
- [ ] Alterar configuração
- [ ] Remover criptografia mediante autorização

## Políticas de segurança

- [ ] Política por senha
- [ ] Política por certificado
- [ ] Política para anexos
- [ ] Criar
- [ ] Copiar
- [ ] Editar
- [ ] Excluir
- [ ] Importar/exportar
- [ ] Políticas servidor-side como módulo enterprise opcional
- [ ] Revogação como módulo enterprise opcional

## Enterprise labels

Opcional:

- [ ] Labels de sensibilidade
- [ ] Adapter para Microsoft Purview Information Protection
- [ ] Restrições derivadas da label

---

# Visualização protegida e sandbox

- [ ] Modo protegido
- [ ] Visualização protegida
- [ ] Abrir arquivo não confiável isolado
- [ ] Bloquear escrita fora do sandbox
- [ ] Bloquear execução de anexos
- [ ] Bloquear ações de lançamento
- [ ] Confirmar URLs externas
- [ ] Restringir APIs JavaScript
- [ ] Lista de locais confiáveis
- [ ] Lista de hosts confiáveis
- [ ] Trust once
- [ ] Trust permanently com confirmação
- [ ] Security warnings claros

---

# Redação permanente

Redação deve remover os objetos reais do documento.

Um retângulo visual sobre o conteúdo **não** é redação.

## Marcação

- [ ] Texto
- [ ] Imagem
- [ ] Área
- [ ] Página
- [ ] Várias páginas

## Buscar e redigir

- [ ] Palavra
- [ ] Frase
- [ ] Múltiplas palavras
- [ ] Padrões
- [ ] Regex como melhoria opcional
- [ ] Palavra inteira
- [ ] Parte da palavra
- [ ] Selecionar ocorrências
- [ ] Marcar todas

## Aparência

- [ ] Cor
- [ ] Sem cor
- [ ] Texto sobreposto
- [ ] Texto customizado
- [ ] Fonte
- [ ] Tamanho
- [ ] Alinhamento
- [ ] Opacidade de marcação

## Códigos

- [ ] Código único
- [ ] Vários códigos por marca
- [ ] Conjuntos de códigos
- [ ] Criar conjunto
- [ ] Editar conjunto
- [ ] Excluir conjunto
- [ ] Importar/exportar conjuntos

## Aplicação

- [ ] Preview
- [ ] Confirmar irreversibilidade
- [ ] Aplicar
- [ ] Oferecer sanitização
- [ ] Salvar como novo arquivo por padrão
- [ ] Verificação pós-redação
- [ ] Garantir que texto removido não seja recuperável por busca/cópia

---

# Sanitização e conteúdo oculto

## Remover tudo

- [ ] Metadados
- [ ] Comentários
- [ ] Anexos
- [ ] Scripts
- [ ] Hidden text
- [ ] Hidden layers
- [ ] Embedded content
- [ ] Form data
- [ ] Links/actions perigosos
- [ ] Informações privadas
- [ ] Objetos não exibidos

## Remoção seletiva

- [ ] Analisar conteúdo oculto
- [ ] Mostrar categorias encontradas
- [ ] Selecionar categorias
- [ ] Remover selecionadas
- [ ] Relatório final

---

# Compactação

## Rápida

- [ ] Baixa
- [ ] Média
- [ ] Alta

## Otimizador avançado

- [ ] Auditoria de uso de espaço
- [ ] Compatibilidade alvo / versão PDF
- [ ] Aplicar a um arquivo
- [ ] Aplicar a múltiplos arquivos
- [ ] Pasta, nome e regra de sobrescrita
- [ ] Downsample color
- [ ] Downsample grayscale
- [ ] Downsample monochrome
- [ ] Average downsampling
- [ ] Subsampling
- [ ] Bicubic downsampling
- [ ] JPEG
- [ ] JPEG2000 quando suportado
- [ ] ZIP/Flate
- [ ] JBIG2 quando suportado
- [ ] Qualidade por tipo de imagem
- [ ] Remover thumbnails incorporadas
- [ ] Desincorporar fontes quando seguro
- [ ] Subset fonts
- [ ] Painel Transparency
- [ ] Flatten transparency
- [ ] Painel Discard Objects
- [ ] Remover objetos incompatíveis/obsoletos selecionados
- [ ] Painel Discard User Data
- [ ] Remover comentários, forms, multimídia e dados privados conforme seleção
- [ ] Painel Clean Up
- [ ] Flate em streams não codificados
- [ ] Converter LZW para Flate quando aplicável
- [ ] Remover bookmarks inválidos
- [ ] Remover links inválidos
- [ ] Remover named destinations não referenciados
- [ ] Optimize page content
- [ ] Descartar conteúdo de layers ocultas quando selecionado
- [ ] Flatten de layers visíveis quando selecionado
- [ ] Linearização/Fast Web View
- [ ] Estimativa antes/depois
- [ ] Salvar preset

---

# Marcadores

- [ ] Criar
- [ ] Renomear
- [ ] Excluir
- [ ] Reordenar
- [ ] Hierarquia
- [ ] Expandir/recolher
- [ ] Expandir todos
- [ ] Recolher todos
- [ ] Destino
- [ ] Aparência
- [ ] Ação
- [ ] Gerar a partir de estrutura
- [ ] Preservar em combinação/conversão

---

# Anexos

- [ ] Listar
- [ ] Preview seguro
- [ ] Abrir com confirmação
- [ ] Salvar
- [ ] Adicionar
- [ ] Remover
- [ ] Renomear
- [ ] Descrição
- [ ] MIME
- [ ] Hash
- [ ] Bloquear extensões perigosas
- [ ] Nunca executar automaticamente

---

# Camadas PDF

- [ ] Visualizar OCGs
- [ ] Mostrar/ocultar
- [ ] Grupos aninhados
- [ ] Layer bloqueada/informativa
- [ ] Listar layers de todas as páginas
- [ ] Listar apenas layers das páginas visíveis
- [ ] Reset to Initial Visibility
- [ ] Apply Print Overrides
- [ ] Apply Export Overrides
- [ ] Apply Layer Overrides
- [ ] Estado inicial
- [ ] Default State
- [ ] Intent: View
- [ ] Intent: Reference
- [ ] Visibility: sempre/nunca/conforme estado
- [ ] Print: sempre/nunca/conforme estado
- [ ] Export: sempre/nunca/conforme estado
- [ ] Importar arquivo como camada
- [ ] Reordenar camada
- [ ] Renomear camada
- [ ] Editar propriedades
- [ ] Adicionar navegação de camada
- [ ] Merge layers
- [ ] Flatten layers
- [ ] Imprimir respeitando visibility
- [ ] Preservar em save
- [ ] Preservar em conversão quando possível

---

# Portfólios PDF

Um Portfólio PDF mantém arquivos independentes dentro de uma unidade integrada.

- [ ] Criar portfólio
- [ ] Abrir portfólio
- [ ] Adicionar arquivo
- [ ] Adicionar pasta
- [ ] Adicionar scanner
- [ ] Adicionar página web
- [ ] Adicionar clipboard
- [ ] Remover componente
- [ ] Renomear componente
- [ ] Editar descrição
- [ ] Preview de componente
- [ ] Extrair componente
- [ ] Pesquisar dentro dos componentes compatíveis
- [ ] Ordenar lista
- [ ] Exibição em lista
- [ ] Navegar por pastas internas
- [ ] Abrir componente no aplicativo compatível
- [ ] Preview de PDF/imagem/texto compatível
- [ ] Editar filename do componente
- [ ] Editar description
- [ ] Manter arquivos componentes independentes
- [ ] Assinaturas/certificação do portfólio
- [ ] Painel de assinaturas do portfólio

---

# Rich Media e 3D

Suporte sempre isolado e desativado por padrão para conteúdo ativo.

## Áudio e vídeo

- [ ] Adicionar vídeo
- [ ] Adicionar som
- [ ] Incorporar mídia local
- [ ] Referenciar mídia por URL HTTP/HTTPS quando permitido
- [ ] H.264
- [ ] AAC
- [ ] MP3
- [ ] MOV/MP4 compatíveis
- [ ] Definir play area
- [ ] Mover play area
- [ ] Redimensionar play area
- [ ] Excluir mídia
- [ ] Poster image
- [ ] Poster a partir de arquivo
- [ ] Poster a partir de frame
- [ ] Launch settings
- [ ] Activation settings
- [ ] Playback style
- [ ] Floating window
- [ ] Playback controls
- [ ] Skin
- [ ] Cor/opacity dos controles
- [ ] Auto-hide controls
- [ ] Preview e trim
- [ ] Chapter points
- [ ] Actions por chapter point
- [ ] Extrair mídia
- [ ] Política de confiança
- [ ] Nunca executar automaticamente

## 3D

- [ ] Detectar objetos 3D
- [ ] Adicionar 3D quando engine permitir
- [ ] U3D
- [ ] PRC
- [ ] Poster/preview estático
- [ ] Ativar conteúdo somente com consentimento
- [ ] Views 3D
- [ ] Navegação/interação 3D
- [ ] Medição de objetos 3D
- [ ] Comentários associados a views 3D
- [ ] Propriedades da área 3D
- [ ] Compatibilidade legada somente quando segura

---

# PDF geoespacial

Módulo profissional.

- [ ] Detectar geospatial PDF
- [ ] Interpretar sistemas de coordenadas
- [ ] Interpretar escala/projeção/metadados espaciais
- [ ] Mostrar latitude/longitude sob o cursor
- [ ] Localizar posição por coordenadas
- [ ] Adicionar marcador geoespacial
- [ ] Copiar coordenadas
- [ ] Formato decimal
- [ ] Graus/minutos/segundos
- [ ] Coordenadas assinadas ou direcionais
- [ ] Opção WGS 1984
- [ ] Medir distância geográfica
- [ ] Medir perímetro
- [ ] Medir área
- [ ] Unidades de distância
- [ ] Unidades de área
- [ ] Criar PDF geoespacial a partir de GeoTIFF
- [ ] Criar PDF geoespacial a partir de JPEG 2000 com metadados espaciais
- [ ] Preservar coordenadas na criação
- [ ] Importar SHP + DBF como layer
- [ ] Validar sobreposição de sistemas de coordenadas
- [ ] Preservar atributos do shapefile
- [ ] Exportar marcações geoespaciais quando suportado

---

# Medição

- [ ] Distância
- [ ] Perímetro
- [ ] Área
- [ ] Calibrar escala
- [ ] Escala por página
- [ ] Unidades
- [ ] Snap
- [ ] Labels
- [ ] Comentários de medição
- [ ] Propriedades
- [ ] Exportar medições

---

# Comparar documentos

## Configuração

- [ ] Arquivo antigo
- [ ] Arquivo novo
- [ ] Trocar lados
- [ ] Intervalo de páginas
- [ ] Comparar somente texto

## Tipo de documento

- [ ] Auto detect
- [ ] Relatório
- [ ] Planilha
- [ ] Layout de revista
- [ ] Apresentação
- [ ] Scan
- [ ] Desenho
- [ ] Ilustração

## Estratégia

- texto corrido para documentos reflowable;
- pareamento de páginas/slides semelhantes;
- comparação por pixel para scans/desenhos;
- texto e gráficos analisados separadamente quando necessário.

## Resultados

- [ ] Documento de relatório
- [ ] Resumo total
- [ ] Texto adicionado
- [ ] Texto removido
- [ ] Texto alterado
- [ ] Formatting
- [ ] Imagens
- [ ] Background
- [ ] Annotations
- [ ] Página movida
- [ ] Próxima diferença
- [ ] Diferença anterior
- [ ] Side by side
- [ ] Single page
- [ ] Filter
- [ ] Show/hide categories
- [ ] Status por diferença
- [ ] Comments list
- [ ] Salvar relatório

---

# Ações de PDF

Elementos do PDF podem disparar ações, desde que a política de segurança permita.

- [ ] Link action
- [ ] Button action
- [ ] Page open
- [ ] Page close
- [ ] Bookmark action
- [ ] Go to page
- [ ] Go to named destination
- [ ] Open URL
- [ ] Submit form
- [ ] Reset form
- [ ] Execute JavaScript em sandbox restrita
- [ ] Bloquear launch actions perigosas

---

# Ações guiadas e automação

Ferramenta para executar sequências de comandos sobre um ou vários arquivos.

## Executar

- [ ] Ação predefinida
- [ ] Ação customizada
- [ ] Arquivo atual
- [ ] Vários arquivos
- [ ] Pasta
- [ ] Scanner
- [ ] Página web
- [ ] Clipboard
- [ ] Start
- [ ] Stop
- [ ] Resume
- [ ] Progresso por etapa
- [ ] Full report

## Criar ação

- [ ] Adicionar tarefa
- [ ] Reordenar tarefa
- [ ] Remover tarefa
- [ ] Fixar configurações
- [ ] Perguntar ao usuário durante execução
- [ ] Adicionar grupo/painel
- [ ] Adicionar instrução
- [ ] Adicionar divisor
- [ ] Nome
- [ ] Descrição

## Gerenciar

- [ ] Editar
- [ ] Renomear
- [ ] Copiar
- [ ] Excluir
- [ ] Reordenar
- [ ] Importar
- [ ] Exportar

---

# Artigos PDF

Artigos definem uma sequência de regiões de leitura para documentos com múltiplas colunas ou conteúdo distribuído entre páginas.

- [ ] Painel Articles
- [ ] Criar Article Box
- [ ] Encadear várias caixas
- [ ] Numeração automática artigo-caixa
- [ ] Finalizar artigo
- [ ] Título
- [ ] Assunto
- [ ] Autor
- [ ] Keywords
- [ ] Ler artigo seguindo a sequência
- [ ] Avançar caixa a caixa
- [ ] Voltar caixa a caixa
- [ ] Restaurar visualização ao terminar
- [ ] Insert article box no meio do thread
- [ ] Mover article box
- [ ] Redimensionar article box
- [ ] Excluir uma caixa
- [ ] Excluir artigo inteiro
- [ ] Renumerar automaticamente após edição
- [ ] Combinar dois artigos
- [ ] Ação de formulário "Read an article"
- [ ] Article Box disponível também em Print Production

---

# Índices e Catálogo

Suporte a pesquisa em grandes coleções de PDFs sem abrir todos os arquivos.

- [ ] Criar índice de texto completo
- [ ] Adicionar pastas ao catálogo
- [ ] Incluir subpastas
- [ ] Excluir paths/padrões
- [ ] Descrição do índice
- [ ] Opções avançadas de indexação
- [ ] Construir índice
- [ ] Atualizar/reconstruir índice
- [ ] Limpar índice
- [ ] Abrir índice existente
- [ ] Pesquisar em índice selecionado
- [ ] Pesquisa em múltiplos documentos
- [ ] Mostrar documento, página e contexto do resultado
- [ ] Navegar diretamente ao resultado
- [ ] Processamento em background
- [ ] Cancelamento
- [ ] Progresso
- [ ] Índices locais, sem upload

---

# Revisão compartilhada

Módulo de colaboração sem IA. Pode utilizar backend configurável e deve permanecer separado do núcleo local.

- [ ] Compartilhar PDF para revisão
- [ ] Convidar revisores
- [ ] Link de revisão
- [ ] Comentários centralizados
- [ ] Respostas
- [ ] Status resolvido/não resolvido
- [ ] Consolidar comentários
- [ ] Atualizar comentários
- [ ] Tracking de participantes
- [ ] Tracking de progresso
- [ ] Data limite
- [ ] Lembretes
- [ ] Encerrar revisão
- [ ] Exportar/importar comentários
- [ ] Backend próprio configurável
- [ ] SharePoint/servidor interno como adapter opcional
- [ ] Operação local de comentários continua independente do serviço online

---

# Propriedades e metadados

- [ ] Título
- [ ] Autor
- [ ] Assunto
- [ ] Keywords
- [ ] Criador
- [ ] Produtor
- [ ] Data de criação
- [ ] Data de modificação
- [ ] Versão PDF
- [ ] Páginas
- [ ] Tamanho
- [ ] Segurança
- [ ] Fontes
- [ ] Initial view
- [ ] Page layout
- [ ] Page mode
- [ ] Language
- [ ] XMP
- [ ] Custom metadata
- [ ] Metadata import/export quando aplicável

---

# Acessibilidade

## Uso

- [ ] Navegação completa por teclado
- [ ] Screen readers
- [ ] ARIA da própria interface
- [ ] Foco visível
- [ ] Alto contraste
- [ ] Reduced motion
- [ ] Escala
- [ ] Read Out Loud
- [ ] Reflow
- [ ] Preferências de leitura

## Preparar acessibilidade

- [ ] Accessibility checker
- [ ] Selecionar regras a verificar
- [ ] Relatório
- [ ] Resultado por regra
- [ ] Resultado por página
- [ ] Navegar do erro até o conteúdo
- [ ] Corrigir automaticamente quando a regra permitir
- [ ] Corrigir manualmente
- [ ] Explicação da regra
- [ ] Marcar item como verificado manualmente quando aplicável
- [ ] Autotag
- [ ] Detectar PDF somente imagem
- [ ] Sugerir OCR
- [ ] Definir idioma
- [ ] Título do documento
- [ ] Tab order
- [ ] Tags
- [ ] Reading order
- [ ] Alternate text
- [ ] Form field descriptions
- [ ] Tables
- [ ] Headers
- [ ] Lists
- [ ] Artifacts

## Reading Order

- [ ] Overlay numerado
- [ ] Text/Paragraph
- [ ] Figure
- [ ] Figure/Caption
- [ ] Form Field
- [ ] Table
- [ ] Heading
- [ ] Background/Artifact
- [ ] Corrigir ordem manualmente

## Tags panel

- [ ] Visualizar árvore
- [ ] Criar tag
- [ ] Remover
- [ ] Reordenar
- [ ] Alterar tipo
- [ ] Corrigir tabela complexa
- [ ] Alt text
- [ ] Links
- [ ] Artifacts

## MathML

- [ ] Preservar MathML em PDFs marcados quando disponível
- [ ] Expor conteúdo matemático a screen readers
- [ ] Testes com NVDA e tecnologias assistivas compatíveis

---

# Impressão

## Diálogo principal

- [ ] Impressora
- [ ] Cópias
- [ ] Intervalo
- [ ] Página atual
- [ ] Seleção
- [ ] Páginas ímpares
- [ ] Páginas pares
- [ ] Reverse
- [ ] Ajustar
- [ ] Tamanho real
- [ ] Shrink oversized
- [ ] Escala customizada
- [ ] Centralizar
- [ ] Auto rotate
- [ ] Orientação
- [ ] Páginas por folha
- [ ] Ordem
- [ ] Duplex
- [ ] Duplex manual
- [ ] Booklet
- [ ] Poster/Tiling
- [ ] Large format
- [ ] Mixed page sizes
- [ ] Marked pages
- [ ] Custom page size
- [ ] Tray quando driver permitir
- [ ] Color
- [ ] Grayscale
- [ ] Print as image
- [ ] Preview

## Comentários e formulários

- [ ] Documento
- [ ] Documento e marcações
- [ ] Documento e carimbos
- [ ] Somente campos
- [ ] Resumo de comentários

## Presets de impressão

- [ ] Criar
- [ ] Salvar
- [ ] Editar
- [ ] Excluir
- [ ] Aplicar

---

# Produção de impressão

Módulo profissional para pré-impressão.

A ferramenta deve reproduzir o fluxo completo de **Use print production**, com cada ferramenta sendo funcional.

## Output Preview

- [ ] Separations preview
- [ ] Soft proof
- [ ] Simulation profile
- [ ] Simulate black ink
- [ ] Simulate paper color
- [ ] Simulate overprinting
- [ ] Spot colors
- [ ] Process plates
- [ ] Ink coverage
- [ ] Total Area Coverage

## Flattener Preview

- [ ] Detectar objetos transparentes
- [ ] Preview das áreas afetadas
- [ ] Raster/vector balance
- [ ] Line art and text resolution
- [ ] Gradient and mesh resolution
- [ ] Preserve overprint
- [ ] Converter texto/traços conforme preset quando necessário
- [ ] Aplicar por página/intervalo
- [ ] Salvar preset

## Save as PDF/X

- [ ] Validar requisitos
- [ ] Escolher variante PDF/X suportada
- [ ] Output intent
- [ ] Converter/salvar
- [ ] Relatório de incompatibilidades
- [ ] Não declarar conformidade sem validação real

## Set Page Boxes

- [ ] MediaBox
- [ ] CropBox
- [ ] BleedBox
- [ ] TrimBox
- [ ] ArtBox
- [ ] Margens numéricas
- [ ] Preview
- [ ] Página atual
- [ ] Intervalo
- [ ] Todas as páginas

## Add Printer Marks

- [ ] Crop marks
- [ ] Registration marks
- [ ] Color bars
- [ ] Page information
- [ ] Offset
- [ ] Page range
- [ ] Incorporar marcas ao PDF

## Fix Hairlines

- [ ] Detectar hairlines
- [ ] Threshold configurável
- [ ] Substituir por traço mais espesso
- [ ] Cor/objeto quando aplicável
- [ ] Preview
- [ ] Intervalo de páginas

## Ink Manager

- [ ] Listar process inks
- [ ] Listar spot inks
- [ ] Mapear spot para process
- [ ] Alias entre inks
- [ ] Ink type
- [ ] Neutral density
- [ ] Trapping sequence
- [ ] Opaque/transparent handling

## Trap Presets

- [ ] Criar preset
- [ ] Editar preset
- [ ] Excluir preset
- [ ] Aplicar por intervalo
- [ ] In-RIP capability detection
- [ ] Não oferecer execução In-RIP quando dispositivo/PPD não suportar

## Add Article Box

- [ ] Criar article thread diretamente pelo módulo de produção
- [ ] Encaminhar para o mesmo domínio de Artigos PDF

## Preflight

- [ ] Perfis de verificação
- [ ] Centenas de checks
- [ ] Detectar problemas
- [ ] Fixups automáticos quando seguros
- [ ] PDF/A validation
- [ ] PDF/X validation
- [ ] PDF/E validation quando aplicável
- [ ] Relatório
- [ ] Preset customizado
- [ ] Mais de um conjunto/biblioteca de perfis
- [ ] Checks
- [ ] Fixups
- [ ] Inspeções avançadas
- [ ] Resultados por objeto
- [ ] Resultados por recurso
- [ ] Output intents
- [ ] Correção de problemas selecionados
- [ ] Preflight actions
- [ ] Droplet/automação equivalente
- [ ] Variáveis de Preflight

## Edit Object

- [ ] Raster
- [ ] Vector
- [ ] Tags
- [ ] Color space
- [ ] Rendering intent
- [ ] Position
- [ ] Size

## Convert Colors

- [ ] RGB -> CMYK
- [ ] CMYK -> RGB
- [ ] Gray
- [ ] Spot/process
- [ ] ICC profile
- [ ] Rendering intent
- [ ] Preserve black
- [ ] Preserve overprint quando possível

## Separações

- [ ] Host-based
- [ ] In-RIP quando dispositivo suportar
- [ ] Process plates
- [ ] Spot plates
- [ ] Frequency
- [ ] Screen angle
- [ ] Ink Manager

## Trapping

- [ ] Detectar estado
- [ ] Off
- [ ] In-RIP
- [ ] Presets

## Transparência

- [ ] Transparency flattening
- [ ] Presets
- [ ] Preview

## Marcas e sangria

- [ ] Crop marks
- [ ] Registration marks
- [ ] Color bars
- [ ] Page information
- [ ] Bleed

---

# Exportação

## PDF para imagem

- [ ] JPEG
- [ ] PNG
- [ ] TIFF
- [ ] BMP quando útil
- [ ] DPI
- [ ] Color space
- [ ] Todas as páginas
- [ ] Intervalo
- [ ] Nome por página

## PDF para documento

- [ ] Word
- [ ] Excel
- [ ] PowerPoint
- [ ] RTF
- [ ] TXT
- [ ] HTML
- [ ] PostScript

---

# Salvamento

- [ ] Salvar
- [ ] Salvar como
- [ ] Salvar cópia
- [ ] Incremental save quando seguro
- [ ] Full rewrite quando necessário
- [ ] Autosave
- [ ] Recovery file
- [ ] Escrita atômica
- [ ] Detectar alteração externa
- [ ] Resolver conflito
- [ ] Validar arquivo salvo
- [ ] Preservar assinatura quando permitido
- [ ] Avisar antes de invalidar assinatura
- [ ] Histórico de undo/redo da sessão

---

# Gerenciador de tarefas

Toda operação pesada deve gerar um `job_id`.

- [ ] Fila global
- [ ] Prioridade
- [ ] Concorrência limitada
- [ ] Progresso real
- [ ] Etapa atual
- [ ] Cancelamento cooperativo
- [ ] Pausa
- [ ] Retomar
- [ ] Retry
- [ ] Backoff
- [ ] Persistência
- [ ] Recuperação após reinício quando segura
- [ ] Notificação
- [ ] Log
- [ ] Erro por arquivo
- [ ] Relatório

---

# Processamento em lote

- [ ] Converter
- [ ] OCR
- [ ] Compactar
- [ ] Aplicar senha
- [ ] Criptografar
- [ ] Remover metadados
- [ ] Sanitizar
- [ ] Marca d'água
- [ ] Cabeçalho/rodapé
- [ ] Bates
- [ ] Redação por busca
- [ ] Combinar
- [ ] Dividir
- [ ] Extrair
- [ ] Renomear
- [ ] Validar PDF/A
- [ ] Preflight
- [ ] Assinar quando política permitir

---

# Segurança da aplicação

- [ ] CSP restritiva
- [ ] Tauri capabilities mínimas
- [ ] Allowlist explícita de commands
- [ ] Validação de todo path
- [ ] Canonicalização de path
- [ ] Proteção contra path traversal
- [ ] Arquivos temporários seguros
- [ ] Temp directory isolado
- [ ] Limpeza de temporários
- [ ] Limite de tamanho
- [ ] Limite de memória
- [ ] Timeout
- [ ] Cancelamento
- [ ] Parser fuzzing
- [ ] Corpus de PDFs malformados
- [ ] Isolamento de codecs quando necessário
- [ ] Nunca executar attachment automaticamente
- [ ] Nunca executar launch action automaticamente
- [ ] JavaScript desativado por padrão
- [ ] URLs externas com confirmação
- [ ] Security warnings compreensíveis
- [ ] Logs sem conteúdo sensível

---

# Privacidade

O Seven Reader deve funcionar sem conta.

Por padrão:

- nenhum PDF é enviado para servidor;
- OCR é local;
- conversão é local quando tecnicamente possível;
- pesquisa é local;
- índices são locais;
- certificados privados permanecem no dispositivo;
- assinaturas salvas permanecem no dispositivo;
- telemetria fica desativada ou estritamente opt-in;
- recursos online devem informar claramente quando conteúdo será enviado.

---

# Compatibilidade PDF

- [ ] PDF 1.x
- [ ] PDF 2.0
- [ ] PDF/A
- [ ] PDF/X
- [ ] PDF/E
- [ ] Tagged PDF
- [ ] AcroForm
- [ ] FDF
- [ ] XFDF
- [ ] XFA quando possível
- [ ] Digital signatures
- [ ] Encryption
- [ ] Embedded fonts
- [ ] Type 1 fonts quando encontradas
- [ ] TrueType
- [ ] OpenType/CFF
- [ ] JBIG2
- [ ] JPEG2000
- [ ] ICC
- [ ] Transparency
- [ ] OCG/Layers
- [ ] Attachments
- [ ] Bookmarks
- [ ] Named destinations
- [ ] Links
- [ ] Comments
- [ ] XMP
- [ ] Linearized PDF
- [ ] PDF Portfolio
- [ ] 3D U3D/PRC
- [ ] Geospatial PDF
- [ ] Multimedia com execução segura
- [ ] MathML em tagged PDFs quando presente

---

# Preferências

## Aparência

- [ ] Claro
- [ ] Escuro
- [ ] Sistema
- [ ] Densidade
- [ ] Escala
- [ ] Fonte UI
- [ ] Reduced motion
- [ ] Quick tools
- [ ] Painéis
- [ ] Barra global
- [ ] Cor de destaque Seven

## Documentos

- [ ] Zoom padrão
- [ ] Layout
- [ ] Rolagem
- [ ] Reabrir na última página
- [ ] Restaurar abas
- [ ] Mostrar miniaturas
- [ ] Unidades
- [ ] Cache
- [ ] Suavização
- [ ] Overprint preview
- [ ] Page display

## Segurança

- [ ] URLs externas
- [ ] JavaScript
- [ ] Attachments
- [ ] Trusted locations
- [ ] Trusted certificates
- [ ] Protected view
- [ ] Sandbox
- [ ] Recent files
- [ ] Limpeza de dados

## OCR

- [ ] Idioma
- [ ] Idiomas adicionais
- [ ] Auto rotate
- [ ] Deskew
- [ ] Confidence threshold
- [ ] OCR automático em scan
- [ ] Pasta de lote

## Conversão

- [ ] Pasta padrão
- [ ] Nome
- [ ] Sobrescrita
- [ ] Preset
- [ ] DPI
- [ ] OCR automático
- [ ] Abrir ao concluir

## Assinaturas

- [ ] Digital ID padrão
- [ ] Timestamp server
- [ ] Validation
- [ ] Revocation
- [ ] Trust
- [ ] Aparência padrão

---

# Atalhos de teclado

## Navegação

- [ ] Próxima página
- [ ] Página anterior
- [ ] Primeira
- [ ] Última
- [ ] Ir para
- [ ] Próxima aba
- [ ] Aba anterior
- [ ] Próxima janela
- [ ] Janela anterior

## Visualização

- [ ] Mão
- [ ] Seleção
- [ ] Marquee zoom
- [ ] Dynamic zoom
- [ ] Zoom +
- [ ] Zoom -
- [ ] Ajustar página
- [ ] Ajustar largura
- [ ] Reflow
- [ ] Fullscreen

## Edição

- [ ] Undo
- [ ] Redo
- [ ] Edit text
- [ ] Edit object
- [ ] Crop
- [ ] Link
- [ ] Insert file
- [ ] Insert blank page
- [ ] Delete page
- [ ] Redact

## Comentários

- [ ] Comment
- [ ] Highlight
- [ ] Underline
- [ ] Strikethrough
- [ ] Stamp
- [ ] Drawing
- [ ] Reply

## Formulários

- [ ] Edit/preview
- [ ] Text field
- [ ] Checkbox
- [ ] Radio
- [ ] List
- [ ] Dropdown
- [ ] Button
- [ ] Signature
- [ ] Barcode
- [ ] Guides
- [ ] Tab order

## Acessibilidade

- [ ] Reading preferences
- [ ] Reflow
- [ ] Read aloud
- [ ] Pause
- [ ] Stop
- [ ] Reading Order

Atalhos de uma tecla devem ser opcionais.

---

# Integração com sistema operacional

## Windows

- [ ] Instalador
- [ ] Desinstalador
- [ ] x64
- [ ] ARM64 quando viável
- [ ] Associação .pdf
- [ ] Definir como padrão
- [ ] Open With
- [ ] Recent files
- [ ] Drag and drop
- [ ] Impressão
- [ ] Scanner
- [ ] WIA/TWAIN
- [ ] Windows certificate store
- [ ] Notificações
- [ ] Atualização
- [ ] Impressora virtual PDF quando tecnicamente implementável

## Linux

- [ ] AppImage
- [ ] DEB
- [ ] RPM
- [ ] x64
- [ ] ARM64 quando viável
- [ ] MIME application/pdf
- [ ] Associação
- [ ] Open With
- [ ] CUPS
- [ ] SANE
- [ ] Keyring
- [ ] Notificações
- [ ] Atualização

## macOS

- [ ] .app
- [ ] DMG
- [ ] Apple Silicon
- [ ] Intel quando suportado
- [ ] Associação .pdf
- [ ] Open With
- [ ] Printing
- [ ] Scanner
- [ ] Keychain
- [ ] Certificados
- [ ] Notificações
- [ ] Atualização

---

# Performance

- [ ] Inicialização rápida
- [ ] Lazy loading
- [ ] Render por tile
- [ ] Cache de páginas
- [ ] Cache LRU
- [ ] Pre-render limitado
- [ ] Virtualização de thumbnails
- [ ] Busca em worker
- [ ] OCR em worker
- [ ] Conversão em worker
- [ ] Compressão em worker
- [ ] Limite de memória
- [ ] Liberar páginas fora da viewport
- [ ] Cancelar renders obsoletos
- [ ] Debounce de zoom
- [ ] Abrir documentos grandes incrementalmente
- [ ] Suporte a milhares de páginas
- [ ] Suporte a arquivos de vários GB quando arquitetura permitir
- [ ] Nenhuma operação pesada bloqueia a UI

---

# Arquitetura proposta

```text
Seven Reader
├── Presentation
│   ├── Home
│   ├── Document Workspace
│   ├── Global Bar
│   ├── All Tools
│   ├── Quick Tools
│   ├── Side Panels
│   ├── Conversion Window
│   ├── OCR Review
│   ├── Compare Workspace
│   ├── Forms Workspace
│   ├── Print Production
│   ├── Guided Actions
│   ├── Batch Jobs
│   └── Settings
│
├── Application
│   ├── Documents
│   ├── Rendering
│   ├── Search
│   ├── Editing
│   ├── Pages
│   ├── Conversion
│   ├── Creation
│   ├── OCR
│   ├── Scanning
│   ├── Comments
│   ├── Forms
│   ├── Signatures
│   ├── Certificates
│   ├── Security
│   ├── Redaction
│   ├── Optimization
│   ├── Comparison
│   ├── Accessibility
│   ├── Print
│   ├── PrintProduction
│   ├── Automation
│   └── Jobs
│
├── Domain
│   ├── Document
│   ├── Page
│   ├── Object
│   ├── Annotation
│   ├── Bookmark
│   ├── Layer
│   ├── Form
│   ├── Signature
│   ├── Certificate
│   ├── OCR
│   ├── Conversion
│   ├── SecurityPolicy
│   ├── Redaction
│   └── Job
│
├── Infrastructure
│   ├── PdfEngine
│   ├── RenderEngine
│   ├── OcrEngine
│   ├── ConversionAdapters
│   ├── ScannerAdapters
│   ├── PrinterAdapters
│   ├── CertificateStores
│   ├── Crypto
│   ├── Filesystem
│   ├── Cache
│   ├── SearchIndex
│   └── Updater
│
└── Native
    ├── Tauri Commands
    ├── Background Workers
    ├── Sandboxed Workers
    ├── File Associations
    ├── Native Windows
    └── OS Integration
```

---

# Comunicação React ↔ Rust

A fronteira deve ser fortemente tipada.

Exemplos:

```text
open_document
close_document
render_page
render_tile
search_document
get_document_metadata
get_page_text
save_document
save_document_as
insert_pages
delete_pages
rotate_pages
crop_pages
extract_pages
split_document
combine_documents
edit_text
edit_image
edit_object
run_ocr
review_ocr_word
scan_document
convert_document
optimize_document
prepare_form
sign_document
certify_document
validate_signatures
encrypt_document
sanitize_document
apply_redactions
compare_documents
run_accessibility_check
run_preflight
print_document
start_action
start_batch_job
cancel_job
pause_job
resume_job
get_job_status
```

Regras:

- não enviar blobs gigantes em JSON;
- usar handles, temp files controlados ou streaming;
- validar todos os argumentos no Rust;
- canonicalizar paths;
- nunca confiar em path vindo da UI;
- jobs longos retornam `job_id`;
- progresso via eventos;
- cancelamento cooperativo;
- erros tipados;
- nenhuma panic atravessa a fronteira Tauri;
- comandos privilegiados exigem capability explícita.

---

# Estado

## Frontend

Somente estado de apresentação:

- abas;
- seleção;
- zoom;
- página;
- ferramenta;
- painel;
- preferências visuais;
- estado resumido dos jobs.

## Backend

- handles;
- objetos PDF;
- cache;
- render tiles;
- text index;
- OCR;
- forms;
- certificates;
- signatures;
- temp files;
- jobs;
- queues;
- recovery state.

---

# Qualidade

A suíte de compatibilidade deve conter PDFs:

- pequenos;
- gigantes;
- milhares de páginas;
- corrompidos;
- truncados;
- criptografados;
- assinados;
- certificados;
- com forms;
- XFA;
- com OCR;
- scans;
- CJK;
- RTL;
- MathML;
- layers;
- attachments;
- 3D;
- multimedia;
- geospatial;
- portfolios;
- PDF/A;
- PDF/X;
- PDF/E;
- PDF 2.0;
- transparência;
- spot colors;
- fontes incomuns;
- imagens enormes;
- JavaScript malicioso;
- decompression bombs;
- objetos profundamente aninhados.

---

# Testes

## Rust

- [ ] Unit
- [ ] Integration
- [ ] Round-trip save/reopen
- [ ] Property-based
- [ ] Fuzzing
- [ ] Corpus malformed PDF
- [ ] Encryption
- [ ] Password permissions
- [ ] Certificate encryption
- [ ] Signature validation
- [ ] Timestamp
- [ ] OCR
- [ ] Conversion
- [ ] Redaction verification
- [ ] Sanitization
- [ ] Preflight
- [ ] Print pipeline

## React

- [ ] Unit
- [ ] Component
- [ ] Keyboard
- [ ] Accessibility
- [ ] Focus management
- [ ] Error boundaries
- [ ] State transitions
- [ ] Multi-window
- [ ] Job progress

## E2E

- [ ] Abrir
- [ ] Renderizar
- [ ] Pesquisar
- [ ] Editar
- [ ] Organizar
- [ ] Combinar
- [ ] Criar
- [ ] Converter
- [ ] Digitalizar
- [ ] OCR
- [ ] Corrigir OCR
- [ ] Comentar
- [ ] Preencher form
- [ ] Criar form
- [ ] Assinar
- [ ] Certificar
- [ ] Validar
- [ ] Proteger
- [ ] Redigir
- [ ] Sanitizar
- [ ] Compactar
- [ ] Comparar
- [ ] Acessibilidade
- [ ] Imprimir
- [ ] Batch
- [ ] Crash recovery

---

# Performance targets

Os números finais devem ser medidos em hardware real.

Metas arquiteturais:

- primeira página antes do processamento total;
- scrolling fluido;
- zoom não bloqueante;
- cancelamento rápido;
- tarefas pesadas fora da UI;
- memória proporcional ao conteúdo ativo;
- virtualização;
- cache limitado;
- recuperação de sessão;
- nenhuma conversão/OCR/print/preflight congela a janela.

---

# CI

Cada Pull Request deve executar pelo menos:

```text
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Além disso:

- TypeScript strict;
- format check;
- lint;
- E2E crítico;
- audit de dependências;
- fuzz smoke tests;
- Windows build;
- Linux build;
- artefatos de instalação.

---

# Releases

## Windows

- Instalador nativo
- x64
- associação .pdf
- ícone oficial
- updater
- checksum

## Linux

- AppImage
- DEB
- RPM quando disponível
- x64
- associação .pdf
- updater/checksum

## macOS

Após estabilização do núcleo:

- .app
- DMG
- Apple Silicon
- assinatura/notarização

---

# Roadmap

## 0.1 — Foundation

- [ ] React 19
- [ ] TypeScript
- [ ] Vite
- [ ] Tauri 2
- [ ] Rust
- [ ] Design system
- [ ] Identidade Seven
- [ ] PDF engine abstraction
- [ ] Open
- [ ] Render
- [ ] Search
- [ ] Navigation
- [ ] Zoom
- [ ] Thumbnails
- [ ] Bookmarks
- [ ] File association

## 0.2 — Desktop workspace

- [ ] Tabs
- [ ] Multi-window
- [ ] Global bar
- [ ] All tools
- [ ] Quick tools
- [ ] Custom side panels
- [ ] Context actions
- [ ] Print

## 0.3 — Pages & creation

- [ ] Organize
- [ ] Extract
- [ ] Split
- [ ] Combine
- [ ] Create blank
- [ ] Clipboard
- [ ] Web
- [ ] Portfolio

## 0.4 — Editing

- [ ] Text
- [ ] Images
- [ ] Objects
- [ ] Links
- [ ] Destinations
- [ ] Headers/footers
- [ ] Watermarks
- [ ] Background
- [ ] Bates

## 0.5 — Conversion

- [ ] Conversion window
- [ ] Queue
- [ ] Office
- [ ] Images
- [ ] HTML
- [ ] Text
- [ ] PostScript
- [x] Presets
- [x] Watch folders

## 0.6 — Scan & OCR

- [ ] Scanner
- [ ] OCR
- [ ] Batch OCR
- [ ] Edit scanned PDF
- [ ] Suspect review
- [ ] Confidence review
- [ ] PDF/A scan

## 0.7 — Comments, forms & sign

- [ ] Comments
- [ ] Stamps
- [ ] Forms
- [ ] Barcodes
- [ ] Form calculations
- [ ] Fill & Sign
- [ ] Digital IDs
- [ ] Digital signatures
- [ ] Certification
- [ ] Validation

## 0.8 — Security

- [ ] Password
- [ ] Certificate encryption
- [ ] Policies
- [ ] Protected view
- [ ] Sandbox
- [ ] Redaction
- [ ] Sanitize

## 0.9 — Professional

- [ ] Advanced optimizer
- [ ] Compare
- [ ] Accessibility
- [ ] MathML
- [ ] Layers
- [ ] Geospatial
- [ ] Guided actions
- [ ] Articles
- [ ] Catalog/indexes
- [ ] Rich Media
- [ ] 3D
- [ ] Shared review
- [ ] Print production
- [ ] Preflight
- [ ] Color management

## 1.0 — Stable

- [ ] Windows
- [ ] Linux
- [ ] Instaladores
- [ ] Updater
- [ ] PDF default app
- [ ] Crash recovery
- [ ] Large-file tests
- [ ] Security tests
- [ ] Fuzzing
- [ ] Compatibility corpus
- [ ] Documentation

## Pós-1.0

- [ ] macOS
- [ ] Online e-sign workflow
- [ ] Enterprise policies
- [ ] Collaboration

---

# Critérios para 1.0

A versão 1.0 somente pode ser marcada como estável quando:

- PDFs simples e complexos abrem corretamente;
- o arquivo não precisa ser totalmente processado para mostrar a primeira página;
- zoom e scroll permanecem responsivos;
- edição não rasteriza o documento inteiro;
- salvar e reabrir preserva alterações;
- salvar não corrompe estrutura;
- forms comuns funcionam;
- digital signatures são validadas;
- OCR produz texto pesquisável;
- revisão de suspeitas funciona;
- conversão tem fila/progresso/cancelamento;
- redação remove o conteúdo real;
- sanitização remove conteúdo oculto selecionado;
- documentos protegidos respeitam permissões;
- sandbox está ativo para conteúdo não confiável;
- Windows e Linux possuem instaladores;
- associação .pdf funciona;
- impressão básica e avançada foi validada;
- crash recovery funciona;
- operações pesadas não bloqueiam UI;
- testes estão verdes;
- fuzzing básico não encontra crash conhecido;
- coleção de compatibilidade foi validada;
- nenhuma ferramenta visível depende de mock ou placeholder;
- cada ferramenta marcada como suportada possui teste E2E do fluxo principal;
- ferramentas condicionais detectam capability real antes de serem habilitadas;
- Artigos, Catálogo/índices, layers, Portfólios e Rich Media preservam o estado após salvar e reabrir quando o padrão PDF permitir.

---

# Não objetivos

O Seven Reader não deve:

- depender de navegador para abrir PDF;
- usar o visualizador PDF do WebView como engine principal;
- rasterizar todas as páginas para permitir edição;
- depender de cloud para leitura;
- depender de cloud para OCR básico;
- enviar documentos sem consentimento explícito;
- incluir recursos de inteligência artificial;
- executar JavaScript automaticamente;
- executar anexos automaticamente;
- executar launch actions automaticamente;
- fingir suporte a um formato quando falta conversor;
- esconder falhas de conversão;
- retornar sucesso com saída incompleta;
- bloquear a UI durante tarefas longas;
- misturar toda a lógica de PDF dentro de componentes React.

---

# Contribuição

Issues e Pull Requests podem cobrir:

- compatibilidade;
- rendering;
- edição;
- páginas;
- OCR;
- conversão;
- scan;
- forms;
- signatures;
- security;
- redaction;
- accessibility;
- print production;
- performance;
- UI;
- installers.

Toda alteração no núcleo PDF deve incluir regressão reproduzível.

---

## Autor

Desenvolvido por [gabriell211](https://github.com/gabriell211).

---

<p align="center">
  <strong>Seven Reader</strong><br />
  Read. Edit. Convert. Sign. Protect.
</p>
