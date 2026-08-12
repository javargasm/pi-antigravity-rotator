# Importar cuentas de Pi/Antigravity

El comando `import` incorpora un export de cuentas Google Antigravity al archivo de configuración multi-provider:

```bash
tuxevil-rotator import ./accounts.json
```

Si no se indica un archivo, se intenta leer:

```text
~/.config/antigravity/accounts.json
```

Se aceptan un array de cuentas, un objeto con la propiedad `accounts` o una cuenta individual. Los campos OAuth pueden estar en camelCase o snake_case:

```json
[
  {
    "email": "user@example.com",
    "refresh_token": "...",
    "project_id": "my-cloud-project",
    "label": "Personal"
  }
]
```

`project_id` es obligatorio. El importador no inventa un proyecto compartido ni usa `default-project` cuando falta; las entradas incompletas se omiten y el comando termina con código de error, sin imprimir tokens.

La operación es idempotente: al repetirla no crea cuentas duplicadas. Si ya existe una cuenta con el mismo email, conserva sus credenciales Ollama y agrega o actualiza la credencial Google Antigravity.

> **Nota:** este importador sólo cubre credenciales Google Antigravity. Para importar credenciales OpenAI Codex desde un export del Codex CLI (`~/.codex/auth.json`), usa `tuxevil-rotator login --provider openai-codex --import <ruta>` — ver [Codex](integrations/codex.md).
