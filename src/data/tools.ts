import type { CapabilityKey, ToolId } from "../types";
import type { IconName } from "../components/SevenIcon";

export interface ToolDefinition {
  id: ToolId;
  label: string;
  description: string;
  icon: IconName;
  group: "Documento" | "Revisão" | "Segurança" | "Profissional" | "Avançado";
  capability?: CapabilityKey | CapabilityKey[];
  implemented: boolean;
}

export const tools: ToolDefinition[] = [
  { id: "edit", label: "Editar PDF", description: "Texto, imagens, links, cabeçalho/rodapé, numeração, marca d’água, fundo e Bates.", icon: "edit", group: "Documento", implemented: true },
  { id: "convert", label: "Converter", description: "Office/ODF/HTML/TXT para PDF e PDF para imagem, texto ou PostScript.", icon: "convert", group: "Documento", capability: ["office", "ghostscript", "pdftotext"], implemented: true },
  { id: "export", label: "Exportar PDF", description: "Exporte páginas para PNG, JPEG, TIFF, TXT ou PostScript.", icon: "open", group: "Documento", capability: ["ghostscript", "pdftotext"], implemented: true },
  { id: "create", label: "Criar PDF", description: "Crie um documento PDF em branco com tamanho e quantidade de páginas definidos.", icon: "create", group: "Documento", implemented: true },
  { id: "organize", label: "Organizar páginas", description: "Reordene, extraia, gire ou divida páginas com processamento local.", icon: "pages", group: "Documento", capability: "qpdf", implemented: true },
  { id: "combine", label: "Combinar arquivos", description: "Mescle PDFs usando processamento local.", icon: "merge", group: "Documento", capability: "qpdf", implemented: true },
  { id: "properties", label: "Propriedades", description: "Inspecione e altere metadados documentais em uma cópia.", icon: "form", group: "Documento", implemented: true },
  { id: "comment", label: "Comentar", description: "Notas, marcações de texto, carimbos e texto livre persistidos como anotações PDF.", icon: "comment", group: "Revisão", implemented: true },
  { id: "fill-sign", label: "Preencher e assinar", description: "Assinatura eletrônica visual ou assinatura digital PAdES com certificado PKCS#12.", icon: "sign", group: "Revisão", implemented: true },
  { id: "certificates", label: "Certificados", description: "PAdES, certificação, timestamp e validação criptográfica de assinaturas.", icon: "certificate", group: "Segurança", capability: "certificates", implemented: true },
  { id: "scan-ocr", label: "Digitalizar e OCR", description: "Digitalização local, OCR pesquisável, PDF/A e revisão de confiança.", icon: "ocr", group: "Documento", capability: ["ocr", "scanner", "tesseract"], implemented: true },
  { id: "forms", label: "Preparar formulário", description: "Ler, preencher e criar campos AcroForm persistentes no documento.", icon: "form", group: "Revisão", implemented: true },
  { id: "protect", label: "Proteger", description: "Criptografia AES-256 e remoção de criptografia autorizada.", icon: "shield", group: "Segurança", capability: "qpdf", implemented: true },
  { id: "sanitize", label: "Sanitizar", description: "Remova JavaScript, ações automáticas, anexos, XFA e metadados selecionados.", icon: "lock", group: "Segurança", implemented: true },
  { id: "redact", label: "Redigir", description: "Remova permanentemente objetos e anotações por área ou busca textual.", icon: "redact", group: "Segurança", capability: "pdf_engine", implemented: true },
  { id: "compare", label: "Comparar arquivos", description: "Compare texto normalizado página a página entre duas versões.", icon: "compare", group: "Revisão", capability: "pdf_engine", implemented: true },
  { id: "optimize", label: "Otimizar PDF", description: "Compressão local com presets de qualidade.", icon: "compress", group: "Profissional", capability: "ghostscript", implemented: true },
  { id: "accessibility", label: "Acessibilidade", description: "Auditoria de tags, idioma, título e estrutura básica.", icon: "accessibility", group: "Profissional", implemented: true },
  { id: "print-production", label: "Produção de impressão", description: "Preflight, cores, sangria e separações.", icon: "print", group: "Profissional", capability: "printing", implemented: false },
  { id: "automation", label: "Ações guiadas", description: "Fluxos repetíveis e processamento em lote.", icon: "automation", group: "Profissional", implemented: false },
  { id: "javascript", label: "JavaScript e ações PDF", description: "Inspeção controlada; execução automática desativada.", icon: "lock", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "portfolio", label: "Portfólios PDF", description: "Coleções e anexos preservados.", icon: "attachment", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "layers", label: "Camadas", description: "OCG, visibilidade e propriedades.", icon: "layers", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "articles", label: "Artigos PDF", description: "Threads de leitura e navegação.", icon: "bookmark", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "catalog", label: "Índices e catálogo", description: "Índice local e pesquisa em coleções.", icon: "search", group: "Avançado", implemented: false },
  { id: "rich-media", label: "Rich Media", description: "Inspeção e preservação com execução segura.", icon: "attachment", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "three-d", label: "3D", description: "Conteúdo U3D/PRC quando suportado.", icon: "layers", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "shared-review", label: "Revisão compartilhada", description: "Importação e exportação de comentários.", icon: "comment", group: "Avançado", capability: "pdf_engine", implemented: false },
  { id: "geospatial", label: "Geoespacial", description: "Medição e dados geoespaciais do documento.", icon: "pages", group: "Avançado", capability: "pdf_engine", implemented: false },
];

export function canRunTool(
  id: ToolId,
  capabilities: import("../types").Capabilities | null,
): boolean {
  const tool = tools.find((item) => item.id === id);
  if (!tool?.implemented) return false;
  if (!tool.capability) return true;
  if (Array.isArray(tool.capability)) {
    return tool.capability.some((capability) => Boolean(capabilities?.[capability]?.available));
  }
  return Boolean(capabilities?.[tool.capability]?.available);
}
