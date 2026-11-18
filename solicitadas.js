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

  /* ---------- leitura "garantida" do print do sistema (layout sempre igual) ----------
     1ª passada: texto todo (para nomes e rótulos, com a posição de cada palavra).
     2ª passada: só os números, recortando o valor embaixo/ao lado de cada rótulo, ampliado, aceitando só dígitos.
     Depois: confere formato (instalação 10 dígitos, CPF/CNPJ com dígito verificador) e a base de clientes da empresa.
     Campo que não fecha fica marcado "confira". */
  function cpfOk(c) { c = dig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; } return true; }
  function cnpjOk(c) { c = dig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false; var calc = function (n) { var s = 0, p = n - 7; for (var i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } var r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === +c[12] && calc(13) === +c[13]; }
  var VALIDA = {
    instalacao: function (v) { return /^30\d{8}$/.test(v); }, usinaInst: function (v) { return /^30\d{8}$/.test(v); },
    uc: function (v) { return /^\d{12,13}$/.test(v); }, usinaUc: function (v) { return /^\d{12,13}$/.test(v); },
    doc: function (v) { return cpfOk(v) || cnpjOk(v); }
  };
  function distancia(a, b) { if (a.length !== b.length) return 9; var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
  // OCR troca 3↔8, 5↔6, 1↔7, 0↔8: tenta trocas de 1 dígito que façam o CPF/CNPJ fechar
  var TROCAS = { '0': '86', '1': '7', '3': '85', '5': '6', '6': '58', '7': '1', '8': '360', '9': '0' };
  function consertaDoc(v) {
    if (VALIDA.doc(v)) return v;
    for (var i = 0; i < v.length; i++) { var t = TROCAS[v[i]] || ''; for (var j = 0; j < t.length; j++) { var w = v.slice(0, i) + t[j] + v.slice(i + 1); if (VALIDA.doc(w)) return w; } }
    return '';
  }
  async function lerImagem(canvas, worker, base, wDig) {
    var r = await worker.recognize(canvas);
    var texto = r.data.text, ws = (r.data.words || []).map(function (w) { return { t: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }; });
    var c = lerPrint(texto), W = canvas.width, H = canvas.height, conf = {};
    var achar = function (f) { for (var i = 0; i < ws.length; i++) if (f(ws[i], i)) return i; return -1; };
    // números: recorte ampliado 2x e 3x, só dígitos, no leitor em inglês (é o que menos troca 1/7 e 3/8)
    async function digitos(x0, y0, x1, y1) {
      x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
      if (x1 - x0 < 8 || y1 - y0 < 5) return [];
      var out = [];
      for (var k = 2; k <= 3; k++) {
        var cv = document.createElement('canvas'), b = 20;
        cv.width = (x1 - x0) * k + 2 * b; cv.height = (y1 - y0) * k + 2 * b;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingQuality = 'high';
        cx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, b, b, (x1 - x0) * k, (y1 - y0) * k);
        out.push(dig((await wDig.recognize(cv)).data.text));
      }
      return out;
    }
    var colw = W * 0.24;
    var alvos = [];
    var iI = achar(function (w, i) { return /^Instala/i.test(w.t) && w.y0 < H * 0.3; });
    if (iI >= 0) { var w = ws[iI]; alvos.push(['instalacao', w.x1, w.y0 - 4, w.x1 + W * 0.12, w.y1 + 4]); }
    var iC = achar(function (w) { return /^Consumid/i.test(w.t) && w.y0 < H * 0.3; });
    if (iC >= 0) { var w2 = ws[iC]; alvos.push(['uc', w2.x1, w2.y0 - 4, w2.x1 + W * 0.13, w2.y1 + 4]); }
    ['Instala', 'Consumid'].forEach(function (nx, n) {
      var i = achar(function (w, k) { return /^Usina$/i.test(w.t) && ws[k + 1] && new RegExp('^' + nx, 'i').test(ws[k + 1].t); });
      if (i >= 0) { var w = ws[i], x = i >= 1 ? ws[i - 1].x0 : w.x0, h = w.y1 - w.y0; alvos.push([n ? 'usinaUc' : 'usinaInst', x - 4, w.y1 + h * 0.5, x + colw * 0.6, w.y1 + h * 2.6]); }
    });
    var iD = achar(function (w) { return /^(CPF|CNPJ):?$/i.test(w.t) && w.y0 > H * 0.3; });
    if (iD >= 0) { var w3 = ws[iD], h3 = w3.y1 - w3.y0; alvos.push(['doc', w3.x0 - 4, w3.y1 + h3 * 0.5, w3.x0 + colw * 0.6, w3.y1 + h3 * 2.6]); }
    for (var a = 0; a < alvos.length; a++) {
      var k = alvos[a][0], cands = (await digitos(alvos[a][1], alvos[a][2], alvos[a][3], alvos[a][4])).concat([dig(c[k])]);
      cands = cands.map(function (v) { v = (k === 'instalacao' || k === 'usinaInst') ? v.slice(0, 10) : v; return k === 'doc' ? (VALIDA.doc(v) ? v : consertaDoc(v) || v) : v; });
      var votos = {}; cands.forEach(function (v) { if (VALIDA[k](v)) votos[v] = (votos[v] || 0) + 1; });
      var melhor = Object.keys(votos).sort(function (x, y) { return votos[y] - votos[x]; })[0];
      if (melhor) { c[k] = melhor; conf[k] = votos[melhor] >= 2 ? 'ok' : 'confira'; }
      else { c[k] = cands[0] || cands[2] || ''; conf[k] = 'confira'; }
    }
    // base de clientes da empresa: instalação conhecida confirma (ou corrige 1 dígito) e traz o CPF/CNPJ
    if (base && c.instalacao) {
      var hit = base[c.instalacao];
      if (!hit && conf.instalacao !== 'ok') {
        var perto = Object.keys(base).filter(function (k) { return distancia(k, c.instalacao) === 1; });
        if (perto.length === 1) { c.instalacao = perto[0]; hit = base[perto[0]]; }
      }
      if (hit) {
        conf.instalacao = 'ok'; conf.base = hit.cliente || '';
        if (!c.nome || palavrasIguais(c.nome, hit.cliente) < 0.5) c.nome = hit.cliente || c.nome;
        if (hit.cpfCnpj && VALIDA.doc(dig(hit.cpfCnpj))) { if (!c.doc) c.doc = dig(hit.cpfCnpj); if (c.doc === dig(hit.cpfCnpj)) conf.doc = 'ok'; }
      }
    }
    c.conf = conf;
    return c;
  }
  function palavrasIguais(a, b) { var A = sem(a).toLowerCase().split(/\W+/).filter(Boolean), B = sem(b).toLowerCase().split(/\W+/).filter(Boolean); if (!A.length || !B.length) return 0; return A.filter(function (x) { return B.indexOf(x) >= 0; }).length / Math.max(A.length, B.length); }
  raiz.Solicitadas = { lerImagem: lerImagem, cpfOk: cpfOk, cnpjOk: cnpjOk, consertaDoc: consertaDoc, RETORNO: RETORNO, TIPOS: TIPOS, PEDE: PEDE, NAO_VALE: NAO_VALE, lerPrint: lerPrint, lerMensagem: lerMensagem, valoresGerar: valoresGerar };
})(typeof window !== 'undefined' ? window : this);
