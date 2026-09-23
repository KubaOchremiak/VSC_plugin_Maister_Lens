/**
 * `markdown-it` ships no types and `@types/markdown-it` would be a third dependency the
 * spec's two-dependency budget does not allow (success criterion 8, which counts only
 * runtime packages, but the budget is easier to defend with no type package either).
 * Only the surface `panel/render.ts` actually uses is declared.
 */
declare module 'markdown-it' {
  export interface Token {
    type: string;
    tag: string;
    attrs: [string, string][] | null;
    content: string;
    markup: string;
    info: string;
    nesting: number;
    level: number;
    children: Token[] | null;
    attrGet(name: string): string | null;
    attrSet(name: string, value: string): void;
  }

  export interface Renderer {
    rules: Record<
      string,
      | ((
          tokens: Token[],
          index: number,
          options: unknown,
          env: unknown,
          self: Renderer
        ) => string)
      | undefined
    >;
    renderToken(tokens: Token[], index: number, options: unknown): string;
    renderInlineAsText(tokens: Token[], options: unknown, env: unknown): string;
  }

  export interface StateCore {
    tokens: Token[];
    env: unknown;
    Token: new (type: string, tag: string, nesting: number) => Token;
  }

  export interface Options {
    html?: boolean;
    linkify?: boolean;
    typographer?: boolean;
  }

  export default class MarkdownIt {
    constructor(options?: Options);
    readonly renderer: Renderer;
    readonly core: { ruler: { push(name: string, rule: (state: StateCore) => void): void } };
    readonly utils: { escapeHtml(text: string): string };
    render(source: string, env?: unknown): string;
  }
}
