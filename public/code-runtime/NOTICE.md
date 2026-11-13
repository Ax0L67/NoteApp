# Bundled code runtimes

These are local, version-pinned assets extracted from the user's npm archives.
They are never fetched from a CDN when a note runs.

- Pyodide 0.27.7: https://github.com/pyodide/pyodide/tree/0.27.7
  (MPL-2.0); CPython and its standard library retain their respective licenses.
  Upstream license: https://github.com/pyodide/pyodide/blob/0.27.7/LICENSE
- browsercc 0.1.1: https://github.com/BertalanD/browsercc (MIT, copied in
  `cpp/LICENSE`). Its Clang/LLD/libc++ toolchain is from LLVM; see the
  Apache-2.0 license with LLVM exceptions at https://llvm.org/LICENSE.txt .
  WASI libc sources and licenses: https://github.com/WebAssembly/wasi-libc .

The vendor JS and Wasm files are unmodified. The application wraps their
factories in memory at runtime and supplies bounded memory / virtual streams.
`versions.json` records the bundled file hashes for reproducibility; it is
not a cryptographic attestation from the upstream publishers.

Review and include the complete upstream third-party notices before public
redistribution. This inventory alone does not replace those notices.
