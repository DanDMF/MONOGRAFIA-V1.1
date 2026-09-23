-- Unidade de investigação (D-019): o "cartão" é só a interface. Ao ser integrada, a unidade é arquivada
-- como histórico/evidência (parágrafo, secção, revisão, fontes e excertos preservados).
comment on table paragraph_card is
  'Unidade de investigação: ideia → pesquisa → leitura → notas → redação → revisão → integrado. Integrada ⇒ arquivada como evidência.';
update paragraph_card set archived_at = integrated_at
 where stage = 'integrated' and archived_at is null;
