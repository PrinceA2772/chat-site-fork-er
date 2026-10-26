# Third-Party Notices

ptr_29 Chat is proprietary (see [LICENSE](LICENSE)), but it runs on and includes
third-party components. Those components remain under their own licences. This
file lists the components that are actually shipped or actively used at
runtime, with the notices their licences require.

If you believe a component is missing or misattributed, report it privately via
[SECURITY.md](SECURITY.md) or open a documentation issue without including
sensitive details.

---

## 1. Vendored in the browser bundle

### Supabase JS — `2.112.3`

- File: `Chatting_updated/public/vendor/supabase.min.js`
- Upstream: <https://github.com/supabase/supabase-js>
- Licence: MIT
- Copyright: Copyright (c) 2020 Supabase

The file is the UMD build of `@supabase/supabase-js@2.112.3`, downloaded and
committed rather than loaded from a CDN at runtime. Its build header records the
original path:

```
Original file: /npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js
```

The Supabase client is used for authentication, database access, realtime
subscriptions and storage. The publishable key it carries is public by design;
access is enforced by Row Level Security and RPC policies, not by the key.

MIT licence text:

```
MIT License

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Self-hosted server dependencies

These are installed from npm when you run `server.js`; they are not part of the
static GitHub Pages artifact.

### Express — `5.2.1`

- Upstream: <https://github.com/expressjs/express>
- Licence: MIT
- Copyright: Copyright (c) 2009-2014 TJ Holowaychuk; Copyright (c) 2013-2014
  Roman Shtylman; Copyright (c) 2014-2015 Douglas Christopher Wilson

### Socket.IO — `4.8.4`

- Upstream: <https://github.com/socketio/socket.io>
- Licence: MIT
- Copyright: Copyright (c) 2014-present Guillermo Rauch and Socket.IO
  contributors

### Transitive dependencies

`npm ci` installs the transitive dependencies of Express and Socket.IO (for
example `body-parser`, `cookie`, `engine.io`, `ws`). Their licence texts are
included in `Chatting_updated/node_modules/**/LICENSE` after installation and
are not reproduced here. Run `npm ls --all` for the resolved tree.

Both direct dependencies use the MIT licence. The complete MIT permission text
is the same as the Supabase notice above; substitute the copyright line for each
project.

---

## 3. Hosted services

These are services, not bundled code. Their own terms and privacy policies
apply to the infrastructure side of the app.

| Service | Role | Terms / policy |
|---|---|---|
| GitHub Pages | Serves the static site | <https://docs.github.com/en/site-policy> |
| GitHub Issues / Actions | Bug-report mirror, CI, deploy | <https://docs.github.com/en/site-policy> |
| Supabase | Auth, Postgres, Realtime, Storage, Vault | <https://supabase.com/terms> · <https://supabase.com/privacy> |
| DiceBear API | Generates default avatar SVGs | <https://www.dicebear.com/legal/> |

### DiceBear avatars

When a user has no custom avatar, the app requests
`https://api.dicebear.com/7.x/thumbs/svg?seed=<username>`. DiceBear is an
independent project; the `thumbs` style and the hosted API have their own
licence and usage terms. The request sends the username as a seed and normal
HTTP request data (such as IP address) to `api.dicebear.com`. Set a custom
avatar or modify the client if you need to avoid that request entirely.

---

## 4. Assets

Image, icon and illustration provenance is documented in [ASSETS.md](ASSETS.md).

---

## 5. Fonts and CSS

The app uses the operating system's UI font stack (`system-ui`,
`-apple-system`, `"Segoe UI"`, etc.). It does not download web fonts from a
third party. The CSS is written for this project and is proprietary.

---

## 6. No other runtime libraries

Apart from the vendored Supabase build and the self-hosted server dependencies
above, the browser app does not load third-party JavaScript at runtime. There is
no analytics SDK, advertising library, tag manager, or CDN-hosted framework.

If a dependency is added in future, add it here in the same change and record
its version, licence and purpose.
