/**
 * Local ESLint rule: every controller method decorated with
 * `@InstitutionAdminAllowed()` must call something on `this.scope`
 * (InstitutionScope) in its body. The decorator only widens *who* may call
 * the handler; the scope call is what limits *what* they may touch. A
 * handler that has one without the other is an open door across
 * institutions (#25 Phase 5).
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: '@InstitutionAdminAllowed() handlers must scope via this.scope.*' },
    schema: [],
    messages: {
      missingScope:
        '@InstitutionAdminAllowed() handler "{{name}}" never calls this.scope.* — institution-admins would reach every institution.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    return {
      MethodDefinition(node) {
        const decorators = node.decorators ?? []
        const allowed = decorators.some(
          (d) =>
            d.expression.type === 'CallExpression' &&
            d.expression.callee.type === 'Identifier' &&
            d.expression.callee.name === 'InstitutionAdminAllowed',
        )
        if (!allowed) return
        const body = sourceCode.getText(node.value.body)
        if (!/\bthis\.scope\.\w+\(/.test(body)) {
          context.report({ node: node.key, messageId: 'missingScope', data: { name: node.key.name } })
        }
      },
    }
  },
}
