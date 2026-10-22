// Dados de teste para semear o armazenamento da extensão (mesmo formato que a extensão grava).
const hoje = new Date();
const dia = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const falas = (n, quem = ['Ana', 'Carlos', 'Junios', 'Eu']) => Array.from({ length: n }, (_, i) => ({ t: i * 7, speaker: quem[i % quem.length], text: `Fala número ${i} sobre o assunto da reunião, com uma frase um pouco mais longa para quebrar linha no painel estreito.` }));
const reuniao = (id, extra = {}) => ({
  id, atualizadoEm: Date.now(),
  payload: { id, startedAt: new Date(Date.now() - 3600e3).toISOString(), endedAt: new Date().toISOString(), titulo: 'Reunião ' + id, transcript: falas(20), marcas: [{ t: 40, texto: 'ponto importante' }], tags: ['Produto'], notes: 'nota um\n- [ ] tarefa', ...extra },
});
const pauta = (titulo, data, hora = '', texto = '1. um\n2. dois\n\nCombinados\n- [ ] x') => ({ titulo, data, hora, texto, atualizadoEm: Date.now() });

function cenario(nome) {
  const s = { ajustes: { pastaOferecida: true } };
  if (nome === 'vazio') return {};
  if (nome === 'cheio') {
    for (let i = 0; i < 12; i++) s['reuniao:cheio' + i] = reuniao('cheio' + i, { titulo: ['Kickoff 🚀 do projeto', '1:1 | Lavínia | Automação Brisas do Paricá (Estevão P. da Silva)', 'Weekly', 'Retro'][i % 4] + ' ' + i, tags: i % 3 ? ['Produto', 'revisão'] : [], transcript: falas(i === 0 ? 400 : 30) });
    s.pautas = {
      p1: pauta('Reunião de hoje', dia(0), '10:00'), p2: pauta('Amanhã cedo', dia(1), '09:30'), p3: pauta('Semana que vem', dia(6)), p4: pauta('Ontem', dia(-1), '15:00'),
    };
    s.agendaMeet = [{ titulo: 'Reunião de hoje', data: dia(0), hora: '10:00', codigo: 'abc-defg-hij' }, { titulo: 'Daily', data: dia(1), hora: '11:00', codigo: 'xyz-wxyz-xyz' }];
    s.agendaLidaEm = Date.now();
    s.tagCores = { Produto: '#0f766e' };
    return s;
  }
  if (nome === 'hostil') {
    const feio = ['A'.repeat(300), '<img src=x onerror="window.__xss=1">', '"><script>window.__xss=1</script>', 'اجتماع الفريق الأسبوعي', '週次ミーティング 会議', 'Ünïcödé 🚀🚀🚀 ' + 'palavraMuitoLongaSemEspaco'.repeat(8), 'x\n## Resumo\n---', '   ', '', 'a'.repeat(5000)];
    feio.forEach((t, i) => { s['reuniao:feio' + i] = reuniao('feio' + i, { titulo: t, tags: [t.slice(0, 40) || 'x', 'b'.repeat(80)], notes: t, transcript: [{ t: 1, speaker: t.slice(0, 60), text: t }, ...falas(5)] }); });
    for (let i = 0; i < 150; i++) s['reuniao:massa' + i] = reuniao('massa' + i, { titulo: 'Massa ' + i, transcript: i === 0 ? falas(4000) : falas(3) });
    s.pautas = {}; feio.forEach((t, i) => { s.pautas['f' + i] = pauta(t, dia(i % 5), '', t + '\n'.repeat(3) + t); });
    s.agendaMeet = feio.map((t, i) => ({ titulo: t, data: dia(0), hora: String(8 + i).padStart(2, '0') + ':00', codigo: 'abc-defg-hij' }));
    return s;
  }
  throw new Error('cenário desconhecido ' + nome);
}
module.exports = { cenario, reuniao, pauta, falas, dia };
