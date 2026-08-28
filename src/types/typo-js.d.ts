declare module 'typo-js' {
  interface TypoDictionary {
    addWord(word: string): void
  }

  interface TypoSettings {
    platform?: string
  }

  export default class Typo {
    dictionary: TypoDictionary
    constructor(locale: string, affData?: string, dicData?: string, settings?: TypoSettings)
    check(word: string): boolean
    suggest(word: string): string[]
  }
}
