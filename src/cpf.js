export const soDigitos = (s) => s.replace(/\D/g, '')

export function validaCPF(v) {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i)
    return ((s * 10) % 11) % 10
  }
  return dv(9) === +d[9] && dv(10) === +d[10]
}

export const mascaraCPF = (v) =>
  soDigitos(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')

export const mascaraCel = (v) =>
  soDigitos(v).slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')

export function idade(nasc, hoje = new Date()) {
  const n = new Date(nasc + 'T00:00')
  let a = hoje.getFullYear() - n.getFullYear()
  if (hoje < new Date(hoje.getFullYear(), n.getMonth(), n.getDate())) a--
  return a
}
