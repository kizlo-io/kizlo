<br>

<p align="center">
  <a name="readme-top"></a>
  <a href="https://kizlo.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.kizlo.io/logo/icon-light.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://cdn.kizlo.io/logo/icon-dark.svg">
      <img alt="Kizlo" src="https://cdn.kizlo.io/logo/icon-dark.svg" height="100">
    </picture>
  </a>
</p>

<h3 align="center">Contact Form 7 Integration</h3>

<p align="center">
  Type-safe form submissions using the Contact Form 7 WordPress plugin
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kizlo/cf7"><img src="https://img.shields.io/npm/v/@kizlo/cf7?style=flat-square&color=333" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/kizlo-io/kizlo?style=flat-square&color=333" alt="License"></a>
  <a href="https://www.npmjs.com/package/@kizlo/cf7"><img src="https://img.shields.io/npm/dt/@kizlo/cf7?style=flat-square&color=333" alt="npm downloads"></a>
</p>

<p align="center">
  <a href="https://kizlo.io"><strong>Website</strong></a> ·
  <a href="https://kizlo.io/docs"><strong>Docs</strong></a> ·
  <a href="https://discord.com/invite/MjAUZamx5g"><strong>Discord</strong></a> ·
  <a href="https://x.com/kizlo_io"><strong>Twitter</strong></a>
</p>

---

## Install

```bash
pnpm add @kizlo/cf7
```

## Submit forms directly

Install the matching Kizlo CF7 plugin and run `kizlo generate`. Submit through `client.cf7.forms.submit(...)` using the generated native input, including `captcha_token`. Configure CAPTCHA verification in WordPress; CF7 retains its validation and spam checks.

This package exports result schemas and `deserializeSubmission` for presenting a successful native response. The former `cf7()` application integration is removed. See [direct clients](https://kizlo.io/docs/concepts/client) and the [v1 migration](https://kizlo.io/docs/concepts/migration-v1).

## License

[Apache 2.0](./LICENSE) © Kizlo