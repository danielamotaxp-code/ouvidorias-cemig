/*
 * Ouvidorias solicitadas: lê o print do contrato (sistema da empresa) e a mensagem do grupo.
 *  - lerPrint(texto do OCR): nome, instalação, UC, CPF/CNPJ do cliente; nome, instalação e UC da usina; data de assinatura.
 *  - lerMensagem(texto): nº da reclamação e o motivo ("por atraso na injeção").
 *  - PEDE[n]: o que cada reclamação precisa; valoresGerar(sol): dados para abrir no "Gerar ouvidoria".
 * O OCR erra em prints pequenos: a pessoa confere os campos antes de salvar.
 */
(function (raiz) {
  'use strict';
  function dig(s) { return String(s || '').replace(/\D/g, ''); }
  function sem(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  var TIPOS = {
    1: 'Reclamação 1 – cobrar retorno do cadastro das recebedoras (3 primeiros meses)',
    2: 'Reclamação 2 – protocolo de cadastro passou de 30 dias sem resposta',
    3: 'Reclamação 3 – 1ª geração caiu no saldo da usina',
    4: 'Reclamação 4 – indeferido por falta de contrato de adesão',
    5: 'Reclamação 5 – divergência de CPF/CNPJ que não existe',
    6: 'Reclamação 6 – conta do cliente não disponibilizada',
    7: 'Reclamação 7 – cobrar conclusão do cadastro (prazo de 60 dias úteis)',
    8: 'Reclamação 8 – cadastro feito, mas os créditos não começaram',
    9: 'Reclamação 9 – créditos começaram abaixo do solicitado'
  };
  // campos que quem pede precisa passar (o protocolo a equipe busca)
  var PEDE = {
    1: ['usinaInst', 'usinaUc'], 2: ['usinaInst', 'usinaUc'], 3: ['usinaInst', 'usinaUc', 'outros'], 4: ['usinaInst', 'usinaUc', 'outros'],
    5: ['usinaInst', 'uc', 'doc'], 6: ['nome', 'instalacao', 'uc'], 7: ['nome', 'instalacao', 'uc', 'outros'], 8: ['nome', 'instalacao', 'uc'], 9: ['nome', 'instalacao', 'uc']
  };
  var NAO_VALE = {
    1: ['nome', 'instalacao', 'uc', 'doc'], 2: ['nome', 'instalacao', 'uc', 'doc'], 3: ['nome', 'instalacao', 'uc', 'doc'], 4: ['nome', 'instalacao', 'uc', 'doc'],
    5: ['instalacao', 'usinaUc'], 6: ['doc', 'usinaNome', 'usinaInst', 'usinaUc'], 7: ['doc', 'usinaNome', 'usinaInst', 'usinaUc'], 8: ['doc', 'usinaNome', 'usinaInst', 'usinaUc'], 9: ['doc', 'usinaNome', 'usinaInst', 'usinaUc']
  };

  function depoisDe(t, re) { var m = re.exec(t); return m ? m[1].trim() : ''; }
  function lerPrint(texto) {
    var t = String(texto || '').replace(/\r/g, ''), s = sem(t);
    var c = {};
    c.idContrato = dig(depoisDe(s, /\bID[:\s]*([0-9ZOoIl]{3,6})/));
    var linhas = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var iId = linhas.findIndex(function (l) { return /^ID[:\s]/i.test(l); });
    c.nome = iId >= 0 && linhas[iId + 1] && !/instala/i.test(sem(linhas[iId + 1])) ? linhas[iId + 1].replace(/[^\wÀ-ú .&'-]+/g, '').trim() : '';
    // instalação e UC do cliente: primeiras ocorrências que não são da usina
    var mi = /\bN\W{0,3}\s*insta\w*\W{0,3}\s*([\d .]{9,14})/i.exec(s.replace(/usina\s+instala\w*[^\n]*/gi, ''));
    c.instalacao = mi ? dig(mi[1]).slice(0, 10) : '';
    var mu = /consumidora\W{0,3}\s*([\d .\-]{11,20})/i.exec(s.replace(/usina\s+consumidora[^\n]*/gi, ''));
    c.uc = mu ? dig(mu[1]) : '';
    c.doc = dig(depoisDe(s, /\b(?:CPF|CNPJ)\W{0,3}\s*([\d.\/\- ]{11,20})/i));
    c.usinaNome = depoisDe(t, /Nome da usina:?\s*\n?\s*([^\n]+)/i).replace(/N\W{0,3}\s*Usina.*$/i, '').trim();
    c.usinaInst = dig(depoisDe(s, /Usina\s+Instala\w*\W{0,3}\s*([\d .]{9,14})/i)).slice(0, 10);
    c.usinaUc = dig(depoisDe(s, /Usina\s+Consumidora\W{0,3}\s*([\d .\-]{11,20})/i));
    c.dataAssinatura = depoisDe(s, /assinatura\W{0,3}\s*(\d{2}\/\d{2}\/\d{4})/i);
    return c;
  }
  function lerMensagem(texto) {
    var s = sem(texto || '');
    var n = /reclama\w*\s*(?:n\W{0,2})?\s*(\d)\b/i.exec(s);
    var mot = /\bpor\s+((?!gentileza|favor)[^,.?!\n]{4,80})/i.exec(String(texto || ''));
    return { tipo: n ? +n[1] : null, motivo: mot ? mot[1].trim() : '' };
  }
  /** Valores para o formulário "Gerar ouvidoria" daquela reclamação. */
  function valoresGerar(s) {
    var n = +s.tipo, d = s.dados || {}, pj = dig(d.doc).length > 11;
    if (n >= 1 && n <= 4) return { nomeUsina: d.usinaNome || '', instalacao: d.usinaInst || '', ucUsina: d.usinaUc || '', protocolo: d.protocolo || '' };
    if (n === 5) return { nomeUsina: d.usinaNome || '', instalacao: d.usinaInst || '', uc: d.uc || '', doc: d.doc || '', protocolo: d.protocolo || '' };
    return { nomeCliente: d.nome || '', instalacao: d.instalacao || '', uc: d.uc || '', pessoa: pj ? 'PJ' : 'PF', protocolo: d.protocolo || '' };
  }
  // reclamações em que quem pede tem que anexar um retorno da Cemig (vai junto na ouvidoria)
  var RETORNO = { 5: 'Resposta da Cemig “Cadastro de unidade recebedora” (a que apontou a divergência)' };
  raiz.Solicitadas = { RETORNO: RETORNO, TIPOS: TIPOS, PEDE: PEDE, NAO_VALE: NAO_VALE, lerPrint: lerPrint, lerMensagem: lerMensagem, valoresGerar: valoresGerar };
})(typeof window !== 'undefined' ? window : this);
