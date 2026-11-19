export function validateText(value: string, min = 2): string {
  const text = value.trim()
  const hasControl = [...text].some(char => char.codePointAt(0)! < 32 || (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159))
  if ([...text].length < min || [...text].length > 120 || hasControl) {
    throw new Error(`Escribe entre ${min} y 120 caracteres, sin caracteres de control.`)
  }
  return text
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && !/fetch|network|load failed/i.test(error.message)) return error.message
  return 'No se pudo completar la operación. Revisa tu conexión y vuelve a intentarlo.'
}
