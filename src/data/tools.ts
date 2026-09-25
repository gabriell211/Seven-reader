import type { CapabilityKey, ToolId } from "../types";
import type { IconName } from "../components/SevenIcon";

export interface ToolDefinition {
  id: ToolId;
  label: string;
  description: string;
  icon: IconName;
  group: "Documento" | "Revisão" | "Segurança" | "Profissional" | "Avançado";
  capability?: CapabilityKey;
}

export const tools: ToolDefinition[] = [
  { id: "edit", label: "Editar PDF", description: "Texto, imagens, objetos, links e conteúdo.", icon: "edit", group: "Documento", capability: "pdf_engine" },
  { id: "convert", label: "Converter", description: "PDF, Office, imagens, texto e formatos de publicação.", icon: "convert", group: "Documento" },
  { id: "create", label: "Criar PDF", description: "Arquivos, imagens, scanner, clipboard e página em branco.", icon: "create", group: "Documento", capability: "pdf_engine" },
  { id: "organize", label: "Organizar páginas", description: "Reordenar, extrair, dividir, girar e inserir.", icon: "pages", group: "Documento", capability: "pdf_engine" },
  { id: "combine", label: "Combinar arquivos", description: "Mescle PDFs e documentos compatíveis.", icon: "merge", group: "Documento", capability: "qpdf" },
  { id: "comment", label: "Comentar", description: "Destaques, notas, desenho, carimbos e revisão.", icon: "comment", group: "Revisão", capability: "pdf_engine" },
  { id: "fill-sign", label: "Preencher e assinar", description: "Campos, assinatura eletrônica e iniciais.", icon: "sign", group: "Revisão", capability: "pdf_engine" },
  { id: "certificates", label: "Certificados", description: "IDs digitais, assinatura, certificação e validação.", icon: "certificate", group: "Segurança", capability: "certificates" },
  { id: "scan-ocr", label: "Digitalizar e OCR", description: "Scanner local, OCR pesquisável e revisão de suspeitas.", icon: "ocr", group: "Documento", capability: "ocr" },
  { id: "forms", label: "Preparar formulário", description: "AcroForm, campos, validação e ordem de tabulação.", icon: "form", group: "Revisão", capability: "pdf_engine" },
  { id: "protect", label: "Proteger", description: "Senha, permissões, criptografia e políticas.", icon: "shield", group: "Segurança", capability: "qpdf" },
  { id: "redact", label: "Redigir", description: "Remoção permanente de conteúdo sensível.", icon: "redact", group: "Segurança", capability: "pdf_engine" },
  { id: "compare", label: "Comparar arquivos", description: "Diferenças visuais e estruturais entre versões.", icon: "compare", group: "Revisão", capability: "pdf_engine" },
  { id: "optimize", label: "Otimizar PDF", description: "Compressão, limpeza e auditoria de tamanho.", icon: "compress", group: "Profissional", capability: "ghostscript" },
  { id: "accessibility", label: "Acessibilidade", description: "Tags, ordem de leitura e verificação.", icon: "accessibility", group: "Profissional", capability: "pdf_engine" },
  { id: "print-production", label: "Produção de impressão", description: "Preflight, cores, sangria e separações.", icon: "print", group: "Profissional", capability: "printing" },
  { id: "automation", label: "Ações guiadas", description: "Fluxos repetíveis e processamento em lote.", icon: "automation", group: "Profissional" },
  { id: "javascript", label: "JavaScript e ações PDF", description: "Inspeção controlada; execução automática desativada.", icon: "lock", group: "Avançado", capability: "pdf_engine" },
  { id: "portfolio", label: "Portfólios PDF", description: "Coleções e anexos preservados.", icon: "attachment", group: "Avançado", capability: "pdf_engine" },
  { id: "layers", label: "Camadas", description: "OCG, visibilidade e propriedades.", icon: "layers", group: "Avançado", capability: "pdf_engine" },
  { id: "articles", label: "Artigos PDF", description: "Threads de leitura e navegação.", icon: "bookmark", group: "Avançado", capability: "pdf_engine" },
  { id: "catalog", label: "Índices e catálogo", description: "Índice local e pesquisa em coleções.", icon: "search", group: "Avançado" },
  { id: "rich-media", label: "Rich Media", description: "Inspeção e preservação com execução segura.", icon: "attachment", group: "Avançado", capability: "pdf_engine" },
  { id: "three-d", label: "3D", description: "Conteúdo U3D/PRC quando suportado.", icon: "layers", group: "Avançado", capability: "pdf_engine" },
  { id: "shared-review", label: "Revisão compartilhada", description: "Importação e exportação de comentários.", icon: "comment", group: "Avançado", capability: "pdf_engine" },
  { id: "geospatial", label: "Geoespacial", description: "Medição e dados geoespaciais do documento.", icon: "pages", group: "Avançado", capability: "pdf_engine" },
];
