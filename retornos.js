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

  /** Prazo escrito no retorno: "até 14/12", "prazo … 14/12/2026", "previsão de 14 de dezembro", "em até 10 dias úteis". */
  function prazoDoTexto(texto, baseISO) {
    var t = sem(texto || '').toLowerCase().replace(/\s+/g, ' ');
    var base = baseISO || new Date().toISOString().slice(0, 10), anoBase = +base.slice(0, 4);
    var gatilho = '(?:ate|prazo|previs\\w*|previst\\w*|retorno|resposta|respondid\\w*|conclus\\w*|concluid\\w*|sera\\w*|data limite|vencimento)';
    var reNum = new RegExp(gatilho + '[^.;]{0,60}?\\b(\\d{1,2})[\\/.-](\\d{1,2})(?:[\\/.-](\\d{2,4}))?\\b');
    var reExt = new RegExp(gatilho + '[^.;]{0,60}?\\b(\\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\\d{4}))?');
    var m = reNum.exec(t), dia, mes, ano;
    if (m) { dia = +m[1]; mes = +m[2]; ano = m[3] ? +m[3] : 0; }
    else if ((m = reExt.exec(t))) { dia = +m[1]; mes = MESES[m[2]]; ano = m[3] ? +m[3] : 0; }
    if (dia && mes >= 1 && mes <= 12 && dia <= 31) {
      if (ano && ano < 100) ano += 2000;
      if (!ano) { ano = anoBase; if (ano + '-' + pad(mes) + '-' + pad(dia) < base) ano++; } // sem ano: a próxima data a partir do retorno
      var iso = ano + '-' + pad(mes) + '-' + pad(dia);
      if (iso >= base) return iso;
    }
    var n = /(?:em ate|no prazo de|prazo de|dentro de) (\d{1,3}) dias? (uteis|corridos)?/.exec(t);
    if (n && !/prazo de resposta e de/.test(n[0] + t.slice(n.index - 20, n.index))) {
      if (n[2] === 'uteis') return maisDiasUteis(base, +n[1]);
      var d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + +n[1]); return d.toISOString().slice(0, 10);
    }
    return '';
  }
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
    c.prazo = prazoDoTexto(texto, c.dataISO) || (c.tipo === 'registro' ? maisDiasUteis(c.dataISO, c.prazoDias || 10) : '');
    c.situacao = c.tipo === 'pedido' ? 'responder' : c.tipo === 'aguardando' || c.tipo === 'registro' ? 'aguardando_cemig' : 'verificar';
    c.novaOuvidoria = c.tipo === 'registro' || c.tipo === 'aguardando' ? 'nao' : 'avaliar';
    c.acao = acaoSugerida(c, plano, corpo);
    return c;
  }

  /* ---------- raciocínio: o que a Cemig afirmou → o que o colaborador tem que verificar ----------
     Cada regra reconhece uma afirmação da Cemig no texto, cita a frase e tira a conclusão (como a equipe faria).
     Ordem importa: as mais específicas primeiro. */
  var RACIOCINIO = [
    { re: /(cpf|cnpj)[^.]{0,80}(divergen|nao confere|incompativel|diferente)|titularidade|titular divergente/,
      nao: /(ajustad|corrigid|regularizad|atualizad)/,
      faz: 'conferir se o CPF/CNPJ do contrato é o mesmo do titular da instalação na Cemig. Se for o mesmo, a Cemig errou: abrir a Reclamação 5 com a resposta da Cemig anexada. Se for diferente, marcar o cliente “Em análise” e avisar o comercial' },
    { re: /(fatura|conta)s?[^.]{0,120}(foram emitidas|foi emitida|emitid[ao]s?|disponibilizad|enviad[ao]s?|encaminhad[ao]s?|gerad[ao]s?)/,
      faz: 'verificar se essas faturas foram realmente emitidas e chegaram ao cliente (agência virtual da Cemig e sistema da empresa). Se não aparecerem ou o cliente não recebeu, a resposta da Cemig não resolveu' },
    { re: /(sem (a impressao do )?codigo de barras|baixo valor|valor minimo)|cobranca[^.]{0,60}(realizada|sera|feita) na (fatura|conta) (referente|seguinte|do mes|de)/,
      faz: 'conferir na fatura seguinte se o valor da fatura sem código de barras foi mesmo cobrado junto, sem cobrança em dobro'},
    { re: /refaturad|refaturamento|revisao (da|de) fatura|fatura (sera|foi) (refeita|corrigida|cancelada)|cancelamento da fatura/,
      faz: 'conferir se a fatura corrigida saiu e se o valor ficou certo' },
    { re: /(credito|injecao|compensac|energia injetada|excedente)[^.]{0,120}(compensad|aplicad|lancad|creditad|regularizad|realizad|incluid|disponibiliz|sera|serao|ocorrer)/,
      faz: 'verificar na próxima fatura do cliente se os créditos/a injeção aparecem compensados na quantidade certa' },
    { re: /(rateio|lista de (unidades )?(beneficiarias|recebedoras)|unidade[s]? (recebedora|beneficiaria))[^.]{0,120}(incluid|cadastrad|atualizad|homologad|aprovad|efetivad|concluid)|cadastro[^.]{0,60}(concluid|efetivad|aprovad|homologad)/,
      faz: 'conferir no sistema da Cemig se a unidade já aparece no rateio da usina com o percentual certo e acompanhar se os créditos começam' },
    { re: /correcao cadastral|cadastro[^.]{0,60}(corrigid|atualizad|regularizad|ajustad)|dados cadastrais/,
      faz: 'verificar se o cadastro está correto agora na Cemig (unidade e usina) e se a próxima fatura sai normal' },
    { re: /(indeferid|improcedente|nao procede|nao foi possivel atender|nao ha (irregularidade|erro)|esta correto|estao corretos|conforme (a )?(legislacao|resolucao|ren))/,
      faz: 'ler o motivo que a Cemig deu e verificar se ela tem razão. Se não tiver, juntar a prova e responder/abrir nova ouvidoria' },
    { re: /(vistoria|visita tecnica|inspecao|leitura)[^.]{0,80}(realizad|agendad|sera|programad)/,
      faz: 'verificar se a vistoria/leitura aconteceu e o que constou nela' },
    { re: /(sera|serao) (realizad|analisad|verificad|providenciad|executad|corrigid|regularizad|efetuad|reprocessad)|em analise|encaminhad[ao] (para|a) (a )?(area|setor)|estamos (verificando|analisando|providenciando)/,
      faz: 'aguardar a Cemig concluir e, passado o prazo, conferir se foi feito de verdade' }
  ];
  function curto(f, re) {
    f = f.replace(/\s+/g, ' ').trim();
    if (f.length <= 220) return f;
    var m = re ? re.exec(sem(f).toLowerCase()) : null, ini = 0;
    if (m && m.index > 60) { ini = Math.max(f.lastIndexOf(', ', m.index - 1) + 2, m.index - 90); ini = f.indexOf(' ', ini - 1) + 1; }
    var t = f.length - ini <= 300 ? f.slice(ini) : f.slice(ini, ini + 240).replace(/\s\S*$/, '');
    return (ini ? '…' : '') + t + (ini + t.length < f.length ? '…' : '');
  }

  /** O que a equipe deve fazer com o retorno: para cada afirmação da Cemig, cita a frase e conclui o que verificar. */
  function acaoSugerida(c, plano, corpo) {
    if (c.tipo === 'registro') return 'A Cemig só confirmou o registro. Logo, aguardar a resposta até ' + br(c.prazo) + ' (' + (c.prazoDias || 10) + ' dias úteis). Se não responder até lá, cobrar a Cemig.';
    var fs = frases(corpo), usadas = {}, passos = [];
    if (c.tipo === 'pedido' && c.pedido) passos.push('A Cemig pediu: “' + curto(c.pedido) + '”. Logo, o colaborador tem que separar e enviar isso à Cemig.');
    RACIOCINIO.forEach(function (r) {
      if (passos.length >= 3) return;
      for (var k = 0; k < fs.length; k++) {
        var fl = sem(fs[k]).toLowerCase();
        if (usadas[k] || !r.re.test(fl) || (r.nao && r.nao.test(fl))) continue;
        usadas[k] = 1;
        passos.push('A Cemig disse: “' + curto(fs[k], r.re) + '”. Logo, o colaborador tem que ' + r.faz + '.');
        break;
      }
    });
    if (!passos.length) passos.push('A Cemig respondeu sem dizer o que fez. Logo, o colaborador tem que verificar as faturas e a situação do cliente para saber se o problema foi resolvido.');
    if (c.prazo) passos.push('A Cemig deu prazo até ' + br(c.prazo) + '. Logo, nessa data o colaborador tem que conferir se foi feito; se não, cobrar a Cemig.');
    if (c.tipo !== 'aguardando') passos.push('Se o problema continuar, avaliar abrir nova ouvidoria.');
    return passos.join('\n');
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

  raiz.Retornos = { prazoDoTexto: prazoDoTexto, palavras: palavras, parecido: parecido, lerCampos: lerCampos, acharRegistro: acharRegistro, TIPOS: TIPOS, SITUACOES: SITUACOES, NOVA: NOVA, maisDiasUteis: maisDiasUteis };
})(typeof window !== 'undefined' ? window : this);
