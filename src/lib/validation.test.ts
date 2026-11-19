import { describe, expect, it } from 'vitest'
import { validateText } from './validation'

describe('validateText', () => {
  it.each([2, 120])('acepta el limite de %i caracteres', length => {
    const text = 'a'.repeat(length)
    expect(validateText(text)).toBe(text)
  })

  it.each(['', ' ', 'a', 'a'.repeat(121)])('rechaza longitudes fuera de rango: %j', text => {
    expect(() => validateText(text)).toThrow('Escribe entre 2 y 120 caracteres')
  })

  it('recorta espacios Unicode antes de validar sin alterar el contenido interior', () => {
    expect(validateText('\u00a0\u2003  Musica  en vivo \u3000')).toBe('Musica  en vivo')
    expect(validateText(`  ${'a'.repeat(120)}  `)).toHaveLength(120)
    expect(() => validateText('  a  ')).toThrow()
  })

  it('cuenta puntos de codigo Unicode, no unidades UTF-16', () => {
    expect(validateText('🎵🎶')).toBe('🎵🎶')
    expect(validateText('🎵'.repeat(120))).toBe('🎵'.repeat(120))
    expect(() => validateText('🎵')).toThrow()
    expect(() => validateText('🎵'.repeat(121))).toThrow()
  })

  it('no normaliza ni elimina acentos o secuencias Unicode combinadas', () => {
    expect(validateText('Beyonc\u00e9')).toBe('Beyonc\u00e9')
    expect(validateText('e\u0301')).toBe('e\u0301')
    expect(validateText('日本語')).toBe('日本語')
  })

  it.each(Array.from({ length: 65 }, (_, index) => index < 32 ? index : index + 95))(
    'rechaza el caracter de control U+%i dentro del texto', code => {
      expect(() => validateText(`ab${String.fromCharCode(code)}cd`)).toThrow('sin caracteres de control')
    },
  )

  it('aplica trim antes de comprobar controles', () => {
    expect(validateText('\t\r\n Cancion \r\n\t')).toBe('Cancion')
    expect(() => validateText('\u0000Cancion')).toThrow()
  })

  it('respeta el minimo configurable sin cambiar el maximo', () => {
    expect(validateText('a', 1)).toBe('a')
    expect(validateText('abc', 3)).toBe('abc')
    expect(() => validateText('ab', 3)).toThrow('entre 3 y 120')
    expect(() => validateText('a'.repeat(121), 1)).toThrow()
  })
})
