# Pendências do projeto

## E-mail corporativo do Google (Google Workspace for Nonprofits)

**Situação:** o pedido foi feito ao Google e está em análise. A resposta deve chegar em até 14 dias úteis (a partir de 19/11/2026).

**Onde mexer:** o DNS de smir14.com.br é gerenciado no **Registro.br**, em
[registro.br/painel](https://registro.br/painel/) → domínio smir14.com.br → **DNS → Configurar zona DNS**
(modo avançado). É preciso entrar com a conta do responsável pelo domínio.

**Zona DNS atual** (configurada em 19/11/2026):

| Tipo  | Nome              | Valor                                                          | Para quê                                          |
|-------|-------------------|----------------------------------------------------------------|---------------------------------------------------|
| A     | smir14.com.br     | 185.199.108.153 / 185.199.109.153 / 185.199.110.153 / 185.199.111.153 | site (GitHub Pages) — **não mexer** |
| CNAME | www.smir14.com.br | smidia14.github.io                                             | site com "www" — **não mexer**                    |
| MX    | smir14.com.br     | 10 imap.mail.webnode.com                                       | e-mail antigo do Webnode (ver abaixo)             |

Não há nenhum registro TXT.

**Quando o Google aprovar:**

1. Adicionar o **TXT de verificação** que o Google informar.
2. **Apagar o MX do Webnode** (`imap.mail.webnode.com`), se ainda estiver lá, e colocar os **MX do Google**.
3. Adicionar o **SPF**: TXT em smir14.com.br com `v=spf1 include:_spf.google.com ~all`.
4. Adicionar o **DKIM**: um TXT `google._domainkey`, com o valor gerado no Admin Console do Google.
5. Adicionar o **DMARC**: TXT `_dmarc` com, por exemplo, `v=DMARC1; p=none; rua=mailto:<e-mail da equipe>`. Depois de algumas semanas sem problemas, mudar para `p=quarantine`.
6. Não apagar nem alterar os registros **A** e **CNAME** do site.
