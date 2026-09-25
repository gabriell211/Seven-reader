import type { CapabilityKey, ToolId } from "../types";
import type { IconName } from "../components/SevenIcon";

export interface ToolDefinition {
  id: ToolId;
  label: string;
  description: string;
  icon: IconName;
  group: "Documento" | "Revisão" | "Segurança" | "Profissional" | "Avançado";
  capability?: CapabilityKey;
  implemented: boolean;
}

export const tools: ToolDefinition[] = [
  { id: "edit", label: "Editar PDF", description: "Texto, imagens, objetos, links e conteúdo.", icon: "edit", group: "Documento", capability: "pdf_engine", implemented: false },
  { id: "convert", label: "Converter", description: "PDF, Office, imagens, texto e formatos de publicação.", icon: "convert", group: "Documento", capability: "office", implemented: false },
  { id: "create", label: "Criar PDF", description: "Arquivos, imagens, scanner, clipboard e página em branco.", icon: "create", group: "Documento", capability: "pdf_engine", implemented: false },
  { id: "organize", label: "Organizar páginas", description: "Reordenar, extrair e girar páginas preservando a estrutura PDF.", icon: "pages", group: "Documento", capability: "qpdf", implemented: true },
  { id: "combine", label: "Combinar arquivos", description: "Mescle PDFs usando processamento local.", icon: "merge", group: "Documento", capability: "qpdf", implemented: true },
  { id: "comment", label: "Comentar", description: "Destaques, notas, desenho, carimbos e revisão.", icon: "comment", group: "Revisão", capability: "pdf_engine", implemented: false },
  { id: "fill-sign", label: "Preencher e assinar", description: "Campos, assinatura eletrônica e iniciais.", icon: "sign", group: "Revisão", capability: "pdf_engine", implemented: false },
  { id: "certificates", label: "Certificados", description: "IDs digitais, assinatura, certificação e validação.", icon: "certificate", group: "Segurança", capability: "certificates", implemented: false },
  { id: "scan-ocr", label: "Digitalizar e OCR", description: "OCR pesquisável local com rotação e deskew.", icon: "ocr", group: "Documento", capability: "ocr", implemented: true },
  { id: "forms", label: "Preparar formulário", description: "AcroForm, campos, validação e ordem de tabulação.", icon: "form", group: "Revisão", capability: "pdf_engine", implemented: false },
  { id: "protect", label: "Proteger", description: "Senha, permissões, criptografia e políticas.", icon: "shield", group: "Segurança", capability: "qpdf", implemented: false },
  { id: "redact", label: "Redigir", description: "Remoção permanente de conteúdo sensível.", icon: "redact", group: "Segurança", capability: "pdf_engine", implemented: false },
  { id: "compare", label: "Comparar arquivos", description: "Diferenças visuais e estruturais entre versões.", icon: "compare", group: "Revisão", capability: "pdf_engine", implemented: false },
  { id: "optimize", label: "Otimizar PDF", description: "Compressão local com presets de qualidade.", icon: "compress", group: "Profissional", capability: "ghostscript", implemented: true },
  { id: "accessibility", label: "Acessibilidade", description: "Tags, ordem de leitura e verificação.", icon: "accessibility", group: "Profissional", capability: "pdf_engine", implemented: false },
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
  return Boolean(capabilities?.[tool.capability]?.available);
}
