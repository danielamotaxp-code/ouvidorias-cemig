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
    registro: 'Confirmação do registro (prazo de resposta)',
    verificar: 'Resposta da Cemig — precisamos verificar',
    pedido: 'A Cemig pediu algo para nós',
    aguardando: 'A Cemig vai resolver (aguardar)',
    resolvido: 'Resolvido (nada a fazer)'
  };
  var SITUACOES = {
    aguardando_cemig: 'Aguardando a Cemig (prazo)',
    verificar: 'Precisamos verificar',
    nova_ouvidoria: 'Abrir nova ouvidoria',
    responder: 'Precisamos responder à Cemig',
    respondido: 'Verificado / respondido',
    encerrado: 'Encerrado'
  };
  var NOVA = { avaliar: 'A avaliar', sim: 'Sim', nao: 'Não' };
  // prazo: data + N dias úteis (sem sábado e domingo)
  function maisDiasUteis(iso, n) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00'), k = 0;
    while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; }
    return d.toISOString().slice(0, 10);
  }
  function br(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
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
    var prazoDias = /prazo de resposta e de (\d+) dias? uteis/.exec(plano);
    c.prazoDias = prazoDias ? +prazoDias[1] : 0;
    var reAguardar = /(sera|serao) (realizad|analisad|verificad|providenciad|executad|corrigid|regularizad|efetuad|reprocessad)|em analise|encaminhad[ao] (para|a) (a )?(area|setor)|prazo (de|previsto)|estamos (verificando|analisando|providenciando)/;
    if (ehRegistro) c.tipo = 'registro';
    else if (rePedido.test(plano)) c.tipo = 'pedido';
    else if (reAguardar.test(plano) && !/(nao houve|nao foi|ainda nao|pendente|correcao|divergencia|erro)/.test(plano)) c.tipo = 'aguardando';
    else c.tipo = 'verificar'; // qualquer resposta sobre um problema: verificar faturas e o que aconteceu com o cliente

    c.pedido = c.tipo === 'pedido' ? frases(corpo).filter(function (f) { return rePedido.test(sem(f).toLowerCase()); }).join(' ') : '';
    var resumo = c.tipo === 'registro'
      ? 'A Cemig registrou a ouvidoria' + (c.numOuvidoria[0] ? ' sob o nº ' + c.numOuvidoria[0] : '') + '. Prazo de resposta: 10 dias úteis.'
      : frases(corpo).filter(function (f) { return !/^(Esclarecimentos adicionais|A Ouvidoria Cemig tem como|Caso seja de seu interesse|Atenciosamente)/i.test(f.trim()); })
          .reduce(function (acc, f) { return acc.join(' ').length < 450 ? acc.concat([f]) : acc; }, []).join(' ');
    c.resumo = resumo.trim();
    c.prazo = c.tipo === 'registro' ? maisDiasUteis(c.dataISO, c.prazoDias || 10) : '';
    c.situacao = c.tipo === 'pedido' ? 'responder' : c.tipo === 'aguardando' || c.tipo === 'registro' ? 'aguardando_cemig' : 'verificar';
    c.novaOuvidoria = c.tipo === 'registro' || c.tipo === 'aguardando' ? 'nao' : 'avaliar';
    c.acao = acaoSugerida(c, plano, corpo);
    return c;
  }

  /** O que a equipe deve fazer com o retorno (a Cemig quase nunca diz isso com todas as letras). */
  function acaoSugerida(c, plano, corpo) {
    if (c.tipo === 'registro') return 'Aguardar a resposta da Cemig até ' + br(c.prazo) + ' (' + (c.prazoDias || 10) + ' dias úteis). Se não responder até lá, cobrar a Cemig.';
    var a = [];
    if (c.tipo === 'pedido' && c.pedido) a.push('Atender ao que a Cemig pediu: ' + c.pedido);
    if (/correcao cadastral|cadastr(o|al)|divergencia|titularidade|vinculad/.test(plano)) a.push('Verificar a correção cadastral citada pela Cemig (cadastro da unidade e da usina) e acompanhar até o faturamento sair.');
    var fat = /faturas?[^.]{0,120}(foram emitidas|foi emitida|disponibilizad)[^.]*\./i.exec(corpo);
    if (fat) a.push('Conferir as faturas citadas (' + fat[0].replace(/\s+/g, ' ').trim().slice(0, 160) + ') e verificar o que aconteceu com o cliente.');
    else if (/nao houve faturamento|sem faturamento|faturamento (nao|ainda)/.test(plano)) a.push('Verificar o faturamento da unidade do cliente nos próximos meses.');
    if (/injec|credit|compensac/.test(plano)) a.push('Verificar a injeção/compensação de créditos do cliente nas próximas faturas.');
    if (c.tipo === 'aguardando') a.push('Aguardar a Cemig concluir o que informou e conferir depois.');
    if (!a.length) a.push('Verificar as faturas e a situação do cliente.');
    if (c.tipo !== 'aguardando') a.push('Se o problema continuar, abrir nova ouvidoria.');
    return a.join(' ');
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

  /* ---------- aprender com as correções da equipe ----------
     Cada vez que alguém corrige "O que vamos fazer" (ou o tipo), o par texto → decisão vira um exemplo.
     Num retorno novo parecido com um exemplo, a plataforma sugere o que a equipe decidiu da outra vez. */
  var PARADAS = ' a o e de da do das dos em no na nos nas que para por com sem sua seu suas seus ao aos as os um uma foi sao ser esta este essa esse isso pela pelo pelas pelos mais como nao sobre entre ainda informamos atencao manifestacao registrada nesta ouvidoria referente cemig prezado senhor senhora '.split(' ');
  function palavras(t) {
    var vistos = {};
    sem(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).forEach(function (w) {
      if (w.length >= 4 && !/^\d+$/.test(w) && PARADAS.indexOf(w) < 0) vistos[w.replace(/(oes|aes|s)$/, '')] = 1;
    });
    return Object.keys(vistos);
  }
  function parecido(c, exemplos) {
    var p = palavras(c.corpo || c.resumo || ''), melhor = null;
    if (!p.length) return null;
    (exemplos || []).forEach(function (ex) {
      var q = ex.palavras || [], inter = q.filter(function (w) { return p.indexOf(w) >= 0; }).length;
      var nota = inter / Math.max(1, Math.min(p.length, q.length));
      if (!melhor || nota > melhor.nota) melhor = { ex: ex, nota: nota };
    });
    return melhor && melhor.nota >= 0.45 ? melhor : null;
  }

  raiz.Retornos = { palavras: palavras, parecido: parecido, lerCampos: lerCampos, acharRegistro: acharRegistro, TIPOS: TIPOS, SITUACOES: SITUACOES, NOVA: NOVA, maisDiasUteis: maisDiasUteis };
})(typeof window !== 'undefined' ? window : this);
