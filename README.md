# Seven Reader

<p align="center">
  <strong>Leitor, editor e suíte completa de PDF para desktop.</strong>
</p>

<p align="center">
  Visualize, edite, organize, converta, assine, proteja, preencha, digitalize e processe documentos PDF em uma aplicação moderna, rápida e local-first.
</p>

---

## Sobre o projeto

O **Seven Reader** é uma aplicação desktop completa para trabalhar com documentos PDF.

O objetivo é reunir em um único aplicativo os fluxos que normalmente exigem diferentes ferramentas:

- Leitura e navegação de PDF
- Edição de texto, imagens e objetos
- Organização de páginas
- Conversão de arquivos
- OCR
- Comentários e anotações
- Formulários
- Assinaturas eletrônicas e digitais
- Proteção e criptografia
- Redação permanente de conteúdo sensível
- Compactação e otimização
- Impressão avançada
- Comparação de documentos
- Digitalização
- Acessibilidade
- Processamento em lote

> **Status:** reconstrução completa a partir do zero. A identidade visual oficial do Seven Reader deve ser preservada, enquanto arquitetura, interface, mecanismo de PDF e fluxos de trabalho serão refeitos.

O Seven Reader é um produto independente. Sua interface deve seguir padrões modernos de produtividade para PDF sem copiar identidade visual, ícones proprietários ou ativos de terceiros.

---

# Objetivos

O Seven Reader deve ser:

- Rápido mesmo com PDFs grandes
- Local-first
- Seguro por padrão
- Multiplataforma
- Compatível com documentos PDF reais do dia a dia
- Simples para leitura
- Completo para uso profissional
- Consistente entre todas as ferramentas
- Capaz de abrir múltiplos documentos simultaneamente
- Capaz de continuar operações longas em segundo plano
- Capaz de recuperar sessões após falhas
- Capaz de operar sem depender de serviços online para os fluxos principais

---

# Stack

O Seven Reader utiliza a mesma base tecnológica do **Seven Mail**.

## Frontend

- React **19.2.3**
- React DOM **19.2.3**
- TypeScript **5.9+**
- Vite **7+**
- `@vitejs/plugin-react`
- CSS moderno com design system próprio
- APIs Tauri para integração nativa

## Desktop

- Tauri **2.11+**
- Rust
- Tauri Plugins oficiais
- Janelas nativas independentes
- File associations
- Deep links quando necessário
- Diálogos nativos
- Sistema de atualização
- Integração com impressão e sistema operacional

## Núcleo nativo

O backend Rust será responsável por:

- Abertura e validação de arquivos
- Renderização
- Parsing
- Manipulação estrutural
- Conversões
- OCR
- Assinaturas digitais
- Criptografia
- Impressão
- Processamento em lote
- Cache
- Indexação
- Operações pesadas em background

A interface React nunca deverá executar processamento pesado de PDF diretamente na thread principal.

---

# Princípios de arquitetura

## Local-first

Abrir, ler, editar, assinar, converter e organizar PDFs não deve exigir uma conta online.

Arquivos do usuário permanecem locais por padrão.

## Processamento nativo

Operações pesadas devem acontecer no backend Rust ou em workers nativos.

A camada React é responsável pela experiência visual e pela orquestração da interface.

## Operações não destrutivas

Sempre que possível:

- manter o documento original intacto;
- trabalhar em uma cópia ou estado transacional;
- permitir desfazer/refazer;
- gravar somente após confirmação;
- usar gravação atômica para evitar corrupção.

## Segurança por padrão

PDF é uma entrada não confiável.

O aplicativo deve tratar com cuidado:

- JavaScript embutido
- URLs
- anexos
- formulários
- ações automáticas
- conteúdo multimídia
- fontes incorporadas
- documentos malformados
- arquivos criptografados
- assinaturas digitais
- objetos desconhecidos

---

# Experiência principal

## Tela inicial

- [ ] Arquivos recentes
- [ ] Favoritos
- [ ] Fixados
- [ ] Abrir arquivo
- [ ] Abrir pasta
- [ ] Criar PDF
- [ ] Digitalizar
- [ ] Combinar arquivos
- [ ] Converter
- [ ] OCR
- [ ] Compactar
- [ ] Assinar
- [ ] Ferramentas recentes
- [ ] Recuperar sessão anterior
- [ ] Histórico local opcional
- [ ] Drag and drop

## Janela do documento

A janela principal deve possuir uma estrutura consistente:

- Barra global superior
- Abas de documentos
- Painel de ferramentas
- Documento central
- Ferramentas rápidas
- Painel lateral configurável
- Navegação inferior
- Indicadores de zoom, página e estado
- Barra de pesquisa
- Menus contextuais

## Barra global

- [ ] Abrir
- [ ] Salvar
- [ ] Salvar como
- [ ] Imprimir
- [ ] Compartilhar arquivo local
- [ ] Desfazer
- [ ] Refazer
- [ ] Pesquisar
- [ ] Acessar ferramentas
- [ ] Preferências
- [ ] Informações do documento

## Todas as ferramentas

Um único painel deve reunir todas as ferramentas disponíveis.

Categorias:

- Visualizar
- Editar
- Organizar
- Converter
- Criar
- Comentar
- Preencher e assinar
- Digitalizar e OCR
- Proteger
- Redigir
- Compactar
- Comparar
- Medir
- Acessibilidade
- Formulários
- Certificados
- Impressão

## Ferramentas rápidas

Barra flutuante e personalizável com:

- Seleção
- Mão
- Comentário
- Destaque
- Desenho
- Texto
- Preenchimento
- Assinatura
- Borracha
- Ferramentas favoritas

O usuário deve poder:

- adicionar ferramentas;
- remover ferramentas;
- reordenar;
- fixar;
- mover a barra;
- restaurar o padrão.

---

# Leitura de PDF

## Renderização

- [ ] Renderização de alta qualidade
- [ ] Antialiasing
- [ ] Texto vetorial nítido
- [ ] Imagens em alta resolução
- [ ] Transparência
- [ ] Máscaras
- [ ] Gradientes
- [ ] Fontes incorporadas
- [ ] Font fallback
- [ ] Perfis de cor
- [ ] Rotação
- [ ] CropBox
- [ ] MediaBox
- [ ] TrimBox
- [ ] BleedBox
- [ ] ArtBox

## Navegação

- [ ] Próxima página
- [ ] Página anterior
- [ ] Ir para página
- [ ] Primeira página
- [ ] Última página
- [ ] Rolagem contínua
- [ ] Página única
- [ ] Duas páginas
- [ ] Duas páginas contínuas
- [ ] Ajustar página
- [ ] Ajustar largura
- [ ] Tamanho real
- [ ] Zoom manual
- [ ] Zoom por seleção
- [ ] Zoom dinâmico
- [ ] Rotação visual
- [ ] Tela cheia
- [ ] Modo leitura
- [ ] Apresentação

## Painel lateral

- [ ] Miniaturas
- [ ] Marcadores
- [ ] Anexos
- [ ] Camadas
- [ ] Comentários
- [ ] Assinaturas
- [ ] Formulários
- [ ] Estrutura/tags
- [ ] Resultados de busca

O painel deve ser personalizável e recolhível.

## Múltiplos documentos

- [ ] Abas
- [ ] Reordenar abas
- [ ] Fechar outras abas
- [ ] Reabrir aba fechada
- [ ] Abrir em nova janela
- [ ] Mover aba para outra janela
- [ ] Comparar lado a lado
- [ ] Restaurar sessão

---

# Pesquisa

- [ ] Pesquisa simples
- [ ] Pesquisa em todas as páginas
- [ ] Destaque dos resultados
- [ ] Navegação resultado a resultado
- [ ] Contagem de resultados
- [ ] Diferenciar maiúsculas/minúsculas
- [ ] Palavra inteira
- [ ] Pesquisa em comentários
- [ ] Pesquisa em marcadores
- [ ] Pesquisa em campos de formulário
- [ ] Pesquisa em anexos de texto compatíveis
- [ ] Pesquisa em documentos OCR
- [ ] Indexação local para documentos grandes
- [ ] Histórico de pesquisa opcional

---

# Seleção e cópia

- [ ] Selecionar texto
- [ ] Selecionar bloco
- [ ] Selecionar imagem
- [ ] Copiar texto
- [ ] Copiar imagem
- [ ] Copiar área como imagem
- [ ] Copiar mantendo ordem de leitura
- [ ] Seleção por coluna
- [ ] Selecionar tudo

---

# Edição de PDF

A edição deve acontecer diretamente sobre o PDF, sem transformar o documento inteiro em uma imagem ou em um editor visual desconectado da estrutura real do arquivo.

## Texto

- [ ] Editar texto existente
- [ ] Inserir texto
- [ ] Excluir texto
- [ ] Alterar fonte
- [ ] Alterar tamanho
- [ ] Negrito
- [ ] Itálico
- [ ] Cor
- [ ] Alinhamento
- [ ] Espaçamento
- [ ] Reposicionar bloco
- [ ] Redimensionar bloco
- [ ] Quebra de linha
- [ ] Preservação de layout
- [ ] Font fallback seguro
- [ ] Aviso quando a fonte original não estiver disponível

## Imagens

- [ ] Inserir imagem
- [ ] Substituir imagem
- [ ] Excluir imagem
- [ ] Redimensionar
- [ ] Recortar
- [ ] Girar
- [ ] Reposicionar
- [ ] Ajustar opacidade
- [ ] Manter proporção

## Objetos

- [ ] Selecionar objeto
- [ ] Mover
- [ ] Redimensionar
- [ ] Rotacionar
- [ ] Duplicar
- [ ] Excluir
- [ ] Alterar ordem
- [ ] Agrupar quando aplicável

## Links

- [ ] Criar link
- [ ] Editar link
- [ ] Remover link
- [ ] Link para URL
- [ ] Link para página
- [ ] Link para arquivo
- [ ] Ação segura

## Elementos de página

- [ ] Cabeçalho
- [ ] Rodapé
- [ ] Numeração
- [ ] Marca d'água
- [ ] Plano de fundo
- [ ] Data
- [ ] Texto personalizado
- [ ] Imagem personalizada
- [ ] Aplicar em intervalo de páginas

---

# Organização de páginas

- [ ] Reordenar por drag and drop
- [ ] Inserir páginas
- [ ] Inserir outro PDF
- [ ] Inserir imagem
- [ ] Inserir página em branco
- [ ] Excluir páginas
- [ ] Duplicar páginas
- [ ] Girar páginas
- [ ] Recortar páginas
- [ ] Redimensionar páginas
- [ ] Extrair páginas
- [ ] Substituir páginas
- [ ] Dividir PDF
- [ ] Combinar PDFs
- [ ] Combinar imagens e documentos
- [ ] Seleção múltipla
- [ ] Operações por intervalo
- [ ] Numeração Bates
- [ ] Preview antes de aplicar

---

# Conversão

A conversão deve ter um **workspace próprio em uma segunda janela nativa**, separado da janela principal de leitura.

Isso evita poluir o leitor e permite processar várias conversões ao mesmo tempo.

## Janela de conversão

- [ ] Abrir como janela independente
- [ ] Drag and drop de vários arquivos
- [ ] Fila de processamento
- [ ] Progresso individual
- [ ] Progresso total
- [ ] Cancelamento
- [ ] Pausa
- [ ] Repetir tarefa
- [ ] Histórico local
- [ ] Abrir pasta de saída
- [ ] Selecionar pasta padrão
- [ ] Sobrescrever ou renomear automaticamente
- [ ] Processamento em background
- [ ] Notificação ao concluir

## Conversão automática

Ao adicionar um arquivo, o Seven Reader deve identificar automaticamente:

- formato de entrada;
- conversões possíveis;
- necessidade de OCR;
- documento digital ou digitalizado;
- quantidade de páginas;
- presença de senha;
- orientação;
- tamanho;
- possíveis limitações.

O usuário não deve precisar configurar parâmetros técnicos para uma conversão comum.

## PDF para

- [ ] DOCX
- [ ] XLSX
- [ ] PPTX
- [ ] TXT
- [ ] RTF
- [ ] HTML
- [ ] Markdown
- [ ] JPG
- [ ] PNG
- [ ] TIFF
- [ ] SVG quando tecnicamente aplicável
- [ ] PDF/A
- [ ] PDF otimizado

## Para PDF

- [ ] DOCX
- [ ] XLSX
- [ ] PPTX
- [ ] TXT
- [ ] RTF
- [ ] HTML
- [ ] Markdown
- [ ] JPG
- [ ] PNG
- [ ] TIFF
- [ ] SVG
- [ ] Múltiplas imagens
- [ ] Clipboard
- [ ] Scanner

## Opções de conversão

- [ ] Preservar layout
- [ ] Preservar imagens
- [ ] Preservar tabelas
- [ ] Detectar colunas
- [ ] Manter links
- [ ] Manter marcadores
- [ ] Intervalo de páginas
- [ ] Resolução de imagem
- [ ] Qualidade
- [ ] Compressão
- [ ] OCR automático
- [ ] Idioma OCR
- [ ] Pasta de saída
- [ ] Nome de saída

---

# OCR

O OCR deve possuir fluxo próprio e não ser apenas um botão de conversão.

## Reconhecimento

- [ ] Detectar páginas digitalizadas
- [ ] OCR automático opcional
- [ ] OCR por página
- [ ] OCR por intervalo
- [ ] OCR do documento inteiro
- [ ] Múltiplos idiomas
- [ ] Detecção automática de idioma
- [ ] Detectar orientação
- [ ] Corrigir rotação
- [ ] Deskew
- [ ] Limpeza de ruído
- [ ] Ajuste de contraste
- [ ] Preservar imagem original
- [ ] Camada de texto pesquisável
- [ ] Texto editável

## Revisão de confiança

O Seven Reader deve permitir revisar OCR **palavra por palavra**.

- [ ] Confidence score por palavra
- [ ] Destacar palavras de baixa confiança
- [ ] Próxima palavra suspeita
- [ ] Palavra suspeita anterior
- [ ] Mostrar imagem original da região
- [ ] Mostrar resultado reconhecido
- [ ] Corrigir manualmente
- [ ] Aceitar sugestão
- [ ] Ignorar ocorrência
- [ ] Ignorar palavra
- [ ] Aplicar correção
- [ ] Filtrar por nível de confiança
- [ ] Revisão antes de salvar

---

# Digitalização

- [ ] Detectar scanners disponíveis
- [ ] Scanner padrão
- [ ] Flatbed
- [ ] Alimentador
- [ ] Frente e verso
- [ ] Resolução
- [ ] Cor
- [ ] Tons de cinza
- [ ] Preto e branco
- [ ] Tamanho de página
- [ ] Auto crop
- [ ] Deskew
- [ ] Remover páginas em branco
- [ ] OCR após digitalização
- [ ] Criar um único PDF
- [ ] Acrescentar a PDF existente
- [ ] Preview
- [ ] Reordenar antes de salvar

---

# Comentários e anotações

- [ ] Nota
- [ ] Destaque
- [ ] Sublinhado
- [ ] Tachado
- [ ] Inserção de texto
- [ ] Substituição de texto
- [ ] Caixa de texto
- [ ] Chamada
- [ ] Desenho livre
- [ ] Borracha
- [ ] Linha
- [ ] Seta
- [ ] Retângulo
- [ ] Círculo
- [ ] Polígono
- [ ] Nuvem
- [ ] Carimbo
- [ ] Carimbos personalizados
- [ ] Anexo em comentário
- [ ] Cor
- [ ] Opacidade
- [ ] Espessura
- [ ] Autor
- [ ] Data
- [ ] Respostas
- [ ] Resolver comentário
- [ ] Filtro
- [ ] Ordenação
- [ ] Exportar comentários
- [ ] Importar comentários XFDF/FDF quando compatível

---

# Formulários

## Preenchimento

- [ ] Campos de texto
- [ ] Checkbox
- [ ] Radio
- [ ] Combo box
- [ ] List box
- [ ] Botões
- [ ] Data
- [ ] Assinatura
- [ ] Tab order
- [ ] Reset
- [ ] Importar dados
- [ ] Exportar dados
- [ ] Auto preenchimento local opcional

## Criação e edição

- [ ] Detectar campos automaticamente
- [ ] Criar campo
- [ ] Editar campo
- [ ] Excluir campo
- [ ] Duplicar campo
- [ ] Alinhar campos
- [ ] Distribuir campos
- [ ] Campo obrigatório
- [ ] Validação
- [ ] Formatação
- [ ] Cálculos
- [ ] Propriedades visuais
- [ ] Ordem de tabulação

## Compatibilidade

- [ ] AcroForm
- [ ] FDF
- [ ] XFDF
- [ ] XFA quando tecnicamente viável
- [ ] Preservação de dados ao salvar

---

# Assinaturas

## Assinatura simples

- [ ] Digitar assinatura
- [ ] Desenhar assinatura
- [ ] Usar imagem
- [ ] Salvar assinatura localmente
- [ ] Iniciais
- [ ] Posicionar
- [ ] Redimensionar
- [ ] Excluir antes de salvar
- [ ] Preenchimento e assinatura em fluxo único

## Certificados digitais

- [ ] Assinar com certificado
- [ ] PKCS#12 / PFX
- [ ] Certificados do sistema
- [ ] CMS / PKCS#7
- [ ] Validar assinatura
- [ ] Mostrar cadeia de certificados
- [ ] Mostrar integridade
- [ ] Mostrar alterações posteriores
- [ ] Timestamp
- [ ] Certificados confiáveis
- [ ] Assinatura visível
- [ ] Assinatura invisível
- [ ] Bloquear documento após assinatura
- [ ] Múltiplas assinaturas
- [ ] Painel de assinaturas

---

# Proteção

## Senhas e criptografia

- [ ] Senha para abrir
- [ ] Senha de permissões
- [ ] Restringir impressão
- [ ] Restringir cópia
- [ ] Restringir edição
- [ ] Criptografia compatível com PDF moderno
- [ ] AES-256 quando suportado
- [ ] Remover proteção mediante autorização
- [ ] Exibir propriedades de segurança

## Sanitização

- [ ] Remover metadados
- [ ] Remover anexos
- [ ] Remover scripts
- [ ] Remover ações ocultas
- [ ] Remover dados de formulário
- [ ] Remover comentários
- [ ] Remover conteúdo oculto
- [ ] Remover camadas ocultas
- [ ] Limpar histórico interno quando aplicável
- [ ] Relatório antes da limpeza

---

# Redação permanente

A redação deve remover efetivamente o conteúdo do PDF.

Não basta desenhar um retângulo preto sobre a página.

- [ ] Marcar texto
- [ ] Marcar área
- [ ] Pesquisar e redigir
- [ ] Redigir várias ocorrências
- [ ] Códigos de redação
- [ ] Texto de sobreposição
- [ ] Cor personalizada
- [ ] Aplicar redações
- [ ] Sanitizar após redigir
- [ ] Confirmar ação irreversível
- [ ] Criar cópia de segurança
- [ ] Verificar se o conteúdo foi realmente removido

---

# Criação de PDF

- [ ] Criar PDF vazio
- [ ] Criar de arquivo
- [ ] Criar de imagem
- [ ] Criar de várias imagens
- [ ] Criar da área de transferência
- [ ] Criar de scanner
- [ ] Criar de HTML
- [ ] Combinar vários arquivos
- [ ] Definir tamanho de página
- [ ] Orientação
- [ ] Margens
- [ ] Metadados
- [ ] PDF/A quando necessário

---

# Compactação e otimização

- [ ] Compactação rápida
- [ ] Baixa
- [ ] Média
- [ ] Alta
- [ ] Personalizada
- [ ] Downsample de imagens
- [ ] Compressão de imagens
- [ ] Remoção de objetos não utilizados
- [ ] Otimização de fontes
- [ ] Limpeza estrutural
- [ ] Linearização para visualização progressiva
- [ ] Estimativa de tamanho
- [ ] Comparação antes/depois
- [ ] Relatório de uso de espaço
- [ ] Preservar qualidade configurável

---

# Marcadores

- [ ] Criar
- [ ] Renomear
- [ ] Excluir
- [ ] Reordenar
- [ ] Hierarquia
- [ ] Alterar destino
- [ ] Expandir/recolher
- [ ] Gerar a partir de títulos quando possível
- [ ] Preservar na combinação
- [ ] Preservar na conversão

---

# Anexos

- [ ] Listar anexos
- [ ] Abrir
- [ ] Salvar
- [ ] Adicionar
- [ ] Excluir
- [ ] Renomear
- [ ] Descrição
- [ ] Aviso para tipos perigosos
- [ ] Nunca executar automaticamente

---

# Camadas

- [ ] Visualizar Optional Content Groups
- [ ] Mostrar/ocultar
- [ ] Preservar estado
- [ ] Imprimir respeitando configuração
- [ ] Inspecionar propriedades básicas

---

# Comparação de documentos

- [ ] Comparar dois PDFs
- [ ] Detectar páginas alteradas
- [ ] Texto adicionado
- [ ] Texto removido
- [ ] Texto alterado
- [ ] Imagens alteradas
- [ ] Movimento de conteúdo
- [ ] Resumo das diferenças
- [ ] Navegação diferença a diferença
- [ ] Filtros
- [ ] Relatório de comparação
- [ ] Visualização lado a lado

---

# Medição

- [ ] Distância
- [ ] Perímetro
- [ ] Área
- [ ] Calibração de escala
- [ ] Unidades
- [ ] Snap quando aplicável
- [ ] Anotações de medição
- [ ] Propriedades

---

# Propriedades do documento

- [ ] Título
- [ ] Autor
- [ ] Assunto
- [ ] Palavras-chave
- [ ] Criador
- [ ] Produtor
- [ ] Data de criação
- [ ] Data de modificação
- [ ] Tamanho
- [ ] Número de páginas
- [ ] Versão PDF
- [ ] Segurança
- [ ] Fontes
- [ ] Página inicial
- [ ] Layout inicial
- [ ] Metadados XMP

---

# Impressão

- [ ] Impressão nativa
- [ ] Selecionar impressora
- [ ] Intervalo
- [ ] Página atual
- [ ] Páginas ímpares
- [ ] Páginas pares
- [ ] Várias páginas por folha
- [ ] Livreto
- [ ] Ajustar
- [ ] Tamanho real
- [ ] Escala personalizada
- [ ] Centralizar
- [ ] Auto rotação
- [ ] Orientação
- [ ] Frente e verso quando suportado
- [ ] Cor
- [ ] Tons de cinza
- [ ] Comentários
- [ ] Formulários
- [ ] Preview
- [ ] Seleção de bandeja quando suportado
- [ ] Impressão rasterizada como fallback

---

# Acessibilidade

- [ ] Navegação completa por teclado
- [ ] ARIA
- [ ] Leitores de tela
- [ ] Foco visível
- [ ] Alto contraste
- [ ] Redução de animações
- [ ] Escala da interface
- [ ] Ordem de leitura
- [ ] Estrutura de tags
- [ ] Texto alternativo de imagens
- [ ] Verificação de acessibilidade
- [ ] Relatório de problemas
- [ ] Assistência para correção
- [ ] Leitura em voz alta usando APIs do sistema

---

# Compatibilidade PDF

O objetivo é suportar PDFs do mundo real, não apenas arquivos simples.

- [ ] PDF 1.x
- [ ] PDF 2.0
- [ ] PDF/A
- [ ] PDF/X
- [ ] PDF/E
- [ ] AcroForm
- [ ] FDF
- [ ] XFDF
- [ ] Assinaturas digitais
- [ ] Documentos protegidos
- [ ] Fontes incorporadas
- [ ] Imagens JBIG2
- [ ] JPEG2000
- [ ] Transparência
- [ ] Camadas
- [ ] Anexos
- [ ] Marcadores
- [ ] Links
- [ ] Comentários
- [ ] Metadados XMP
- [ ] Documentos linearizados
- [ ] Portfólios PDF quando tecnicamente viável
- [ ] Conteúdo multimídia com execução segura e controlada

---

# Salvamento e recuperação

- [ ] Salvar
- [ ] Salvar como
- [ ] Salvar uma cópia
- [ ] Autosave configurável
- [ ] Recuperação após crash
- [ ] Escrita atômica
- [ ] Backup temporário
- [ ] Detectar alteração externa
- [ ] Avisar conflito
- [ ] Preservar assinaturas quando a alteração permitir
- [ ] Avisar quando uma operação invalidar assinatura
- [ ] Histórico de desfazer/refazer durante a sessão

---

# Processamento em lote

A segunda janela de ferramentas deve permitir filas independentes da janela principal.

- [ ] Converter vários arquivos
- [ ] OCR em vários arquivos
- [ ] Compactar vários arquivos
- [ ] Aplicar senha
- [ ] Remover metadados
- [ ] Adicionar marca d'água
- [ ] Inserir cabeçalho/rodapé
- [ ] Renomear saída
- [ ] Combinar
- [ ] Dividir
- [ ] Extrair páginas
- [ ] Barra de progresso
- [ ] Cancelar
- [ ] Retry
- [ ] Log por tarefa
- [ ] Relatório final

---

# Gerenciador de tarefas

Operações demoradas nunca devem travar a interface.

- [ ] Fila global
- [ ] Prioridade
- [ ] Concorrência limitada
- [ ] Cancelamento seguro
- [ ] Retry com backoff
- [ ] Pausa
- [ ] Progresso real
- [ ] ETA quando possível
- [ ] Persistência da fila
- [ ] Retomar tarefas após reinício quando seguro
- [ ] Notificação de conclusão
- [ ] Registro de erros compreensível

---

# Desempenho

- [ ] Inicialização rápida
- [ ] Lazy loading
- [ ] Renderização por tiles
- [ ] Cache de páginas
- [ ] Pré-renderização limitada
- [ ] Virtualização de miniaturas
- [ ] Busca em background
- [ ] OCR em background
- [ ] Conversão em background
- [ ] Limite de memória configurável
- [ ] Liberação de páginas fora da viewport
- [ ] Debounce de zoom
- [ ] Cancelamento de renderizações obsoletas
- [ ] Suporte a documentos com milhares de páginas
- [ ] Suporte a arquivos grandes
- [ ] Telemetria desativada por padrão

---

# Segurança

- [ ] CSP restritiva
- [ ] Privilégios mínimos no Tauri
- [ ] Allowlist explícita de comandos
- [ ] Validação de paths
- [ ] Proteção contra path traversal
- [ ] Arquivos temporários com nomes seguros
- [ ] Limpeza de temporários
- [ ] Nunca executar anexos automaticamente
- [ ] Nunca executar JavaScript de PDF automaticamente
- [ ] Confirmação antes de abrir links externos
- [ ] Sanitização de URLs
- [ ] Limites de tamanho
- [ ] Limites de memória
- [ ] Timeouts
- [ ] Proteção contra PDFs malformados
- [ ] Fuzz testing do parser nativo
- [ ] Isolamento de operações potencialmente perigosas

---

# Privacidade

O Seven Reader deve funcionar sem criar uma conta.

Por padrão:

- documentos não são enviados para servidores;
- OCR é local;
- conversões são locais sempre que tecnicamente possível;
- assinaturas ficam no dispositivo;
- certificados privados nunca deixam o sistema;
- histórico é local;
- telemetria não é obrigatória.

Qualquer recurso online futuro deverá ser explicitamente opt-in.

---

# Preferências

## Aparência

- [ ] Tema claro
- [ ] Tema escuro
- [ ] Seguir sistema
- [ ] Densidade
- [ ] Escala
- [ ] Tamanho de fonte da interface
- [ ] Animações
- [ ] Ferramentas rápidas
- [ ] Painéis laterais
- [ ] Barra global
- [ ] Cor de destaque da identidade Seven

## Documentos

- [ ] Zoom padrão
- [ ] Layout padrão
- [ ] Rolagem padrão
- [ ] Abrir na última página
- [ ] Restaurar abas
- [ ] Mostrar miniaturas
- [ ] Unidades
- [ ] Suavização
- [ ] Cache

## Segurança

- [ ] Comportamento de links
- [ ] JavaScript de PDF desativado por padrão
- [ ] Conteúdo externo
- [ ] Certificados confiáveis
- [ ] Arquivos temporários
- [ ] Limpeza de dados recentes

## OCR

- [ ] Idioma padrão
- [ ] Idiomas adicionais
- [ ] Nível mínimo de confiança
- [ ] Pré-processamento
- [ ] OCR automático em scans

## Conversão

- [ ] Pasta padrão
- [ ] Convenção de nomes
- [ ] Sobrescrita
- [ ] Qualidade de imagem
- [ ] OCR automático
- [ ] Abrir arquivo ao concluir

---

# Atalhos de teclado

- [ ] Abrir
- [ ] Salvar
- [ ] Salvar como
- [ ] Imprimir
- [ ] Fechar documento
- [ ] Reabrir documento
- [ ] Pesquisar
- [ ] Próxima ocorrência
- [ ] Ocorrência anterior
- [ ] Zoom +
- [ ] Zoom -
- [ ] Ajustar página
- [ ] Ajustar largura
- [ ] Página seguinte
- [ ] Página anterior
- [ ] Girar
- [ ] Desfazer
- [ ] Refazer
- [ ] Comentário
- [ ] Destaque
- [ ] Ferramenta mão
- [ ] Seleção
- [ ] Tela cheia
- [ ] Atalhos configuráveis

---

# Integração com o sistema operacional

## Windows

- [ ] Instalador
- [ ] Desinstalador
- [ ] Associação .pdf
- [ ] Definir como leitor padrão
- [ ] Abrir com
- [ ] Ícone oficial
- [ ] Impressão
- [ ] Scanner
- [ ] Certificados do Windows
- [ ] Recent files
- [ ] Notificações nativas
- [ ] Atualização do aplicativo

## Linux

- [ ] AppImage
- [ ] DEB
- [ ] RPM quando aplicável
- [ ] Associação .pdf
- [ ] MIME application/pdf
- [ ] Abrir com
- [ ] Impressão via sistema
- [ ] Scanner via SANE quando disponível
- [ ] Keyring
- [ ] Notificações
- [ ] Atualização do aplicativo

## macOS

- [ ] Bundle .app
- [ ] DMG
- [ ] Associação .pdf
- [ ] Abrir com
- [ ] Impressão
- [ ] Scanner quando suportado
- [ ] Keychain
- [ ] Notificações
- [ ] Atualização do aplicativo

---

# Arquitetura proposta

```text
Seven Reader
├── Presentation
│   ├── Home
│   ├── Document Workspace
│   ├── All Tools
│   ├── Quick Tools
│   ├── Side Panels
│   ├── Conversion Window
│   ├── OCR Review
│   ├── Batch Jobs
│   └── Settings
│
├── Application
│   ├── OpenDocument
│   ├── SaveDocument
│   ├── RenderPage
│   ├── Search
│   ├── Edit
│   ├── Organize
│   ├── Convert
│   ├── OCR
│   ├── Forms
│   ├── Signatures
│   ├── Security
│   ├── Redaction
│   ├── Print
│   └── Jobs
│
├── Domain
│   ├── Document
│   ├── Page
│   ├── Annotation
│   ├── Form
│   ├── Signature
│   ├── Conversion
│   ├── OCR
│   ├── SecurityPolicy
│   └── Job
│
├── Infrastructure
│   ├── PdfEngine
│   ├── OcrEngine
│   ├── ConversionEngine
│   ├── Scanner
│   ├── Printer
│   ├── Certificates
│   ├── Filesystem
│   ├── Cache
│   ├── Index
│   └── Updates
│
└── Native
    ├── Tauri Commands
    ├── Background Workers
    ├── File Associations
    ├── Native Windows
    └── OS Integration
```

---

# Comunicação React ↔ Rust

A fronteira entre frontend e backend deve ser fortemente tipada.

Exemplos de comandos:

```text
open_document
close_document
render_page
search_document
get_document_metadata
save_document
save_document_as
insert_pages
delete_pages
rotate_pages
extract_pages
combine_documents
run_ocr
review_ocr_word
convert_document
compress_document
sign_document
validate_signatures
sanitize_document
apply_redactions
print_document
start_batch_job
cancel_job
get_job_status
```

Regras:

- Não retornar blobs gigantes em JSON.
- Usar caminhos controlados, handles ou streaming.
- Validar todos os argumentos no Rust.
- Nunca confiar em paths vindos diretamente da UI.
- Operações demoradas retornam `job_id`.
- Progresso é enviado por eventos.
- Cancelamento deve ser cooperativo.
- Erros nativos devem ser convertidos para tipos conhecidos.

---

# Estado e cache

O frontend deve manter apenas estado de interface.

Dados pesados pertencem ao backend.

## Frontend

- abas;
- painel ativo;
- seleção;
- zoom;
- ferramenta ativa;
- preferências visuais;
- status das tarefas.

## Backend

- handles dos documentos;
- cache de renderização;
- índices de texto;
- páginas;
- jobs;
- resultados OCR;
- dados temporários;
- certificados;
- estruturas PDF.

---

# Qualidade

Antes de uma versão estável, o Seven Reader deve ser testado com:

- PDFs pequenos
- PDFs gigantes
- PDFs com milhares de páginas
- PDFs criptografados
- PDFs assinados
- PDFs corrompidos
- PDFs parcialmente corrompidos
- PDFs digitalizados
- PDFs com OCR
- PDFs com formulários
- PDFs com fontes incomuns
- PDFs com CJK
- PDFs RTL
- PDFs com transparência
- PDFs com camadas
- PDFs com anexos
- PDFs com comentários
- PDFs com links
- PDFs com imagens enormes
- PDFs com metadados
- PDF/A
- PDF/X
- PDF 2.0

---

# Testes

## Rust

- [ ] Unit tests
- [ ] Integration tests
- [ ] Property-based tests
- [ ] Fuzz tests
- [ ] Parser malformed input tests
- [ ] Signature validation tests
- [ ] Encryption tests
- [ ] Save/reopen round-trip tests
- [ ] OCR integration tests
- [ ] Conversion integration tests

## React

- [ ] Unit tests
- [ ] Component tests
- [ ] Keyboard navigation tests
- [ ] Accessibility tests
- [ ] State transition tests
- [ ] Error boundary tests

## E2E

- [ ] Abrir PDF
- [ ] Editar
- [ ] Salvar
- [ ] Reabrir
- [ ] Converter
- [ ] OCR
- [ ] Organizar páginas
- [ ] Preencher formulário
- [ ] Assinar
- [ ] Validar assinatura
- [ ] Redigir
- [ ] Imprimir
- [ ] Recuperar após crash

---

# Performance targets

As métricas exatas devem ser validadas em hardware real, mas o projeto deve perseguir:

- abertura percebida imediata com carregamento progressivo;
- primeira página renderizada antes do processamento completo do documento;
- scroll sem travamentos;
- zoom sem bloquear a interface;
- processamento pesado fora da UI;
- consumo de memória proporcional às páginas realmente em uso;
- cancelamento rápido de tarefas;
- nenhum congelamento da interface durante OCR, conversão ou compactação.

---

# CI

Cada Pull Request deve validar:

```text
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

Além disso:

- lint TypeScript;
- format check;
- clippy;
- testes E2E principais;
- verificação de vulnerabilidades;
- build Windows;
- build Linux;
- artefatos de instalação.

---

# Releases

## Windows

- Instalador nativo
- x64
- Associação de PDF
- Ícone oficial
- Atualização

## Linux

- AppImage
- DEB
- x64
- Associação de PDF
- Atualização

## macOS

Planejado após estabilização do núcleo desktop.

---

# Roadmap

## 0.1.0 — Fundação

- [ ] React 19 + TypeScript + Vite
- [ ] Tauri 2 + Rust
- [ ] Design system
- [ ] Identidade Seven Reader
- [ ] Abrir PDF
- [ ] Renderizar
- [ ] Navegar
- [ ] Zoom
- [ ] Busca
- [ ] Miniaturas
- [ ] Marcadores
- [ ] File association

## 0.2.0 — Workspace profissional

- [ ] Abas
- [ ] Múltiplas janelas
- [ ] Todas as ferramentas
- [ ] Quick tools
- [ ] Painéis personalizáveis
- [ ] Comentários
- [ ] Anotações
- [ ] Impressão

## 0.3.0 — Organização

- [ ] Reordenar páginas
- [ ] Inserir
- [ ] Excluir
- [ ] Extrair
- [ ] Dividir
- [ ] Combinar
- [ ] Recortar
- [ ] Rotacionar

## 0.4.0 — Edição

- [ ] Texto
- [ ] Imagens
- [ ] Objetos
- [ ] Links
- [ ] Cabeçalhos
- [ ] Rodapés
- [ ] Marca d'água
- [ ] Plano de fundo

## 0.5.0 — Conversão

- [ ] Janela dedicada
- [ ] Fila
- [ ] PDF para Office
- [ ] Office para PDF
- [ ] Imagens
- [ ] HTML
- [ ] Texto
- [ ] Conversão em lote

## 0.6.0 — OCR

- [ ] OCR local
- [ ] Detecção de scan
- [ ] Texto pesquisável
- [ ] Texto editável
- [ ] Confidence score
- [ ] Revisão palavra por palavra
- [ ] Digitalização

## 0.7.0 — Forms & Sign

- [ ] Formulários
- [ ] Fill & Sign
- [ ] Certificados
- [ ] Assinaturas digitais
- [ ] Validação

## 0.8.0 — Segurança

- [ ] Senhas
- [ ] Criptografia
- [ ] Sanitização
- [ ] Redação permanente
- [ ] Certificados confiáveis

## 0.9.0 — Ferramentas profissionais

- [ ] Compactação avançada
- [ ] Comparação
- [ ] Medição
- [ ] Acessibilidade
- [ ] Processamento em lote
- [ ] PDF/A

## 1.0.0 — Stable

- [ ] Windows
- [ ] Linux
- [ ] Instaladores
- [ ] Atualizador
- [ ] Associação de PDF
- [ ] Testes de carga
- [ ] Testes de segurança
- [ ] Fuzzing
- [ ] Recuperação de crash
- [ ] Documentação completa
- [ ] Compatibilidade validada com coleção ampla de PDFs reais

---

# Critérios para 1.0

A versão 1.0 só deve ser considerada pronta quando:

- PDFs comuns e complexos abrirem corretamente;
- a primeira página aparecer rapidamente;
- a navegação permanecer fluida;
- edições não corromperem o documento;
- salvar e reabrir preservar as alterações;
- formulários funcionarem;
- assinaturas puderem ser validadas;
- OCR produzir camada pesquisável;
- a revisão OCR de baixa confiança funcionar;
- conversões possuírem fila e progresso;
- redação remover realmente o conteúdo;
- documentos protegidos forem tratados corretamente;
- Windows e Linux possuírem instaladores;
- associação de `.pdf` funcionar;
- crash recovery funcionar;
- operações pesadas não travarem a UI;
- a suíte de testes estiver verde.

---

# Não objetivos

O Seven Reader não deve:

- depender de navegador para abrir PDF;
- renderizar páginas como simples screenshots quando não necessário;
- transformar todo PDF em canvas destrutivo para permitir edição;
- depender de serviços online para leitura;
- enviar documentos para terceiros por padrão;
- executar JavaScript embutido automaticamente;
- executar anexos automaticamente;
- esconder erros de conversão;
- informar sucesso quando o arquivo final estiver incompleto;
- bloquear a interface durante operações longas.

---

# Contribuição

Issues e Pull Requests podem ser utilizados para:

- bugs;
- compatibilidade PDF;
- renderização;
- performance;
- edição;
- conversão;
- OCR;
- formulários;
- assinaturas;
- segurança;
- impressão;
- acessibilidade;
- interface;
- instaladores.

Toda alteração que mexa no núcleo PDF deve incluir teste de regressão.

---

## Autor

Desenvolvido por [gabriell211](https://github.com/gabriell211).

---

<p align="center">
  <strong>Seven Reader</strong><br />
  Read. Edit. Convert. Sign. Protect.
</p>
