/*
 * Retorno das ouvidorias: lê o texto dos PDFs que a Cemig manda e liga cada um à ouvidoria do registro.
 *  - lerCampos(texto): número na Ouvidoria, protocolo do portal, UC, instalação, nome, data, texto da resposta,
 *    tipo do retorno e o que a Cemig pediu (se pediu);
 *  - acharRegistro(campos, registros): a ouvidoria a que o retorno se refere.
 * A leitura é por regras (palavras do texto); a pessoa confere antes de salvar.
 */
(function (raiz) {
  'use strict';
  var TIPOS = {
    registro: 'Confirmação do registro (nº da Ouvidoria)',
    pedido: 'A Cemig pediu algo para nós',
    aguardando: 'A Cemig vai resolver (aguardar)',
    resolvido: 'Respondido / resolvido'
  };
  var SITUACOES = {
    responder: 'Precisamos responder à Cemig',
    aguardando_cemig: 'Aguardando a Cemig',
    respondido: 'Respondemos — aguardando a Cemig',
    encerrado: 'Encerrado'
  };
  var MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

  function sem(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function dig(s) { return String(s || '').replace(/\D/g, ''); }
  function semZeros(s) { return dig(s).replace(/^0+/, ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function unicos(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }
  function todos(re, t, g) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(t))) out.push(m[g || 1]); return out; }

  function frases(t) { return String(t).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/); }

  function lerCampos(textoOriginal) {
    var texto = String(textoOriginal || '').replace(/\r/g, '').replace(/\(D|\(O/g, '@'); // OCR troca @ por (D / (O
    var t = sem(texto);
    var c = { texto: texto };

    var ref = /Nossa\s+Refer[eê]ncia:?[\s\S]{0,60}?(\d{8,})/i.exec(t); c.referencia = ref ? ref[1] : '';

    // data do retorno: "Data: 17.11.2026" (carta) ou "17 de novembro de 2026" (e-mail) ou a primeira dd/mm/aaaa
    var d = /Data:\s*(\d{2})[.\/](\d{2})[.\/](\d{4})/i.exec(t) || /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i.exec(t) || /(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
    if (d) { var mes = isNaN(+d[2]) ? MESES[d[2].toLowerCase()] : +d[2]; if (mes) c.dataISO = d[3] + '-' + pad(mes) + '-' + pad(+d[1]); }

    // número na Ouvidoria Cemig ("sob o nº 1261783960", "sob o protocolo de nº001262010754")
    c.numOuvidoria = unicos(todos(/(?:Ouvidoria|manifesta\w+)[^.\n]{0,60}?n\s*[ºo°.]\s*:?\s*(\d{9,13})/gi, t).map(semZeros));
    // protocolo do portal (o que fica no registro): "Protocolo: 1794858233", "Número do Protocolo: …"
    c.protocolos = unicos(todos(/Protocolo:?\s*(\d{9,11})\b/gi, t).map(semZeros).concat(todos(/\b(179\d{7})\b/g, t)));
    c.ucs = unicos(todos(/unidade\s+consumidora\s*(?:n\s*[ºo°]\s*)?:?\s*([\d.\-]{11,20})/gi, t).map(dig).filter(function (x) { return x.length >= 10; }));
    c.instalacoes = unicos(todos(/Instala[cç][aã]o\s*:?\s*(\d{10})\b/gi, t).concat(todos(/\busina\s+(\d{10})\b/gi, t)));

    var nome = /Nome\s+Completo\s+([^\n]+)/i.exec(texto) || /(?:Ilmo\.?\s*\(?a?\)?\s*Sr\.?\(?a?\)?|Ilma\.?\s*Sra\.?)\s*\n\s*([^\n]+)/i.exec(texto);
    c.nome = nome ? nome[1].trim() : '';

    // texto da resposta: do "Prezado" até o "Atenciosamente", sem rodapé
    var ini = texto.search(/Prezad[oa]/i), fim = texto.search(/Atenciosamente/i);
    var corpo = ini >= 0 ? texto.slice(ini, fim > ini ? fim : undefined) : texto;
    corpo = corpo.split('\n').filter(function (l) { return !/Av\. Barbacena|P[aá]gina \d+ de \d+|Belo Horizonte - MG\s*$|mail\.google\.com|^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/.test(l); }).join('\n');
    corpo = corpo.replace(/^Prezad[oa][^\n]*\n/i, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    c.corpo = corpo;

    var plano = sem(corpo).toLowerCase();
    var ehRegistro = /manifestacao foi registrada|prazo de resposta e de/.test(plano) && !/informamos|esclarecemos|verificamos|constatamos/.test(plano);
    var rePedido = /(solicitamos que|solicitamos o envio|pedimos que|favor (encaminhar|enviar|apresentar|informar)|e necessario (que|o envio|apresentar|encaminhar|informar)|necessitamos|aguardamos (o envio|a documentacao|seu retorno|o retorno de v)|devera (encaminhar|enviar|apresentar|comparecer|entrar em contato|informar)|encaminhe|envie|apresente|providencie)/;
    var reAguardar = /(sera|serao) (realizad|analisad|verificad|providenciad|executad|corrigid|regularizad|efetuad|reprocessad)|em analise|encaminhad[ao] (para|a) (a )?(area|setor)|prazo (de|previsto)|estamos (verificando|analisando|providenciando)/;
    if (ehRegistro) c.tipo = 'registro';
    else if (rePedido.test(plano)) c.tipo = 'pedido';
    else if (reAguardar.test(plano)) c.tipo = 'aguardando';
    else c.tipo = 'resolvido';

    c.pedido = c.tipo === 'pedido' ? frases(corpo).filter(function (f) { return rePedido.test(sem(f).toLowerCase()); }).join(' ') : '';
    var resumo = c.tipo === 'registro'
      ? 'A Cemig registrou a ouvidoria' + (c.numOuvidoria[0] ? ' sob o nº ' + c.numOuvidoria[0] : '') + '. Prazo de resposta: 10 dias úteis.'
      : frases(corpo).filter(function (f) { return !/^(Esclarecimentos adicionais|A Ouvidoria Cemig tem como|Caso seja de seu interesse|Atenciosamente)/i.test(f.trim()); })
          .reduce(function (acc, f) { return acc.join(' ').length < 450 ? acc.concat([f]) : acc; }, []).join(' ');
    c.resumo = resumo.trim();
    c.situacao = c.tipo === 'pedido' ? 'responder' : c.tipo === 'aguardando' || c.tipo === 'registro' ? 'aguardando_cemig' : 'encerrado';
    return c;
  }

  /** Ouvidoria do registro a que o retorno se refere: nº da Ouvidoria, protocolo, instalação ou UC (nessa ordem). */
  function acharRegistro(c, registros) {
    var rs = registros || [];
    var mais = function (lista) { return lista.sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); })[0] || null; };
    var p;
    p = rs.filter(function (r) { return r.numOuvidoria && c.numOuvidoria.indexOf(semZeros(r.numOuvidoria)) >= 0; });
    if (p.length) return { registro: mais(p), por: 'nº da Ouvidoria' };
    p = rs.filter(function (r) { return r.protocolo && c.protocolos.indexOf(semZeros(r.protocolo)) >= 0; });
    if (p.length) return { registro: mais(p), por: 'protocolo' };
    p = rs.filter(function (r) { return r.instalacao && c.instalacoes.indexOf(dig(r.instalacao)) >= 0; });
    if (p.length) return { registro: mais(p), por: 'instalação' };
    p = rs.filter(function (r) { return r.uc && c.ucs.indexOf(dig(r.uc)) >= 0; });
    if (p.length) return { registro: mais(p), por: 'unidade consumidora' };
    return { registro: null, por: '' };
  }

  raiz.Retornos = { lerCampos: lerCampos, acharRegistro: acharRegistro, TIPOS: TIPOS, SITUACOES: SITUACOES };
})(typeof window !== 'undefined' ? window : this);
