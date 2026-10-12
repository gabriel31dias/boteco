// node src/cpf.test.mjs
import assert from 'node:assert'
import { validaCPF, mascaraCPF, mascaraCel, idade } from './cpf.js'
assert(validaCPF('529.982.247-25'))
assert(validaCPF('11144477735'))
assert(!validaCPF('529.982.247-24'))
assert(!validaCPF('111.111.111-11'))
assert(!validaCPF('123'))
assert.equal(mascaraCPF('52998224725'), '529.982.247-25')
assert.equal(mascaraCel('11987654321'), '(11) 98765-4321')
assert.equal(idade('2008-10-06', new Date(2026, 9, 5)), 17)
assert.equal(idade('2008-10-05', new Date(2026, 9, 5)), 18)
console.log('ok')
