# Config

配置文件使用 JSON：

> [!note]
> 默认配置文件位置 `/opt/meow-comment/config.json`

```json
{
    "listen": "127.0.0.1:9100",
    "admin_listen": "127.0.0.1:9101",
    "admin_key_file": "/var/lib/meow-comment/admin.key",
    "db_path": "/var/lib/meow-comment/comments.db",
    "proxy_ip_header": "X-Forwarded-For",
    "rss_title": "Meow Comment RSS",
    "rss_link": "https://comment.xxx.com",
    "captcha_enabled": true,
    "allowed_sites_enabled": true,
    "allowed_sites": [
        "https://blog.xxx.com"
    ],
    "admin_allowed_origins": [
        "https://comment.xxx.com"
    ]
}
```

`admin_listen`（默认 `127.0.0.1:9101`）只提供给 CLI 使用。前端和 Web 管理接口都通过 `listen`（例如 `127.0.0.1:9100`）访问。`admin_allowed_origins` 用于允许前端页面跨域调用 Web 管理接口；为空时允许任意 Origin，生产环境建议显式配置。

通用 OIDC 登录和来源配置见 [OIDC 登录](./oidc.md)。

## 启动服务

```shell
/opt/meow-comment/meow-comment serve --config /opt/meow-comment/config.json
```

## RSS Token

创建 token

```shell
sudo meow-commentctl token create \
    --config /opt/meow-comment/config.json \
    --name blog
```

列出当前所有 RSS token

```shell
sudo meow-commentctl token list \
    --config /opt/meow-comment/config.json
```

删除 token

```shell
sudo meow-commentctl token delete \
    --config /opt/meow-comment/config.json \
    --name blog
```

也可以通过 token ID 删除

```shell
sudo meow-commentctl token delete \
    --config /opt/meow-comment/config.json \
    --id TOKEN_ID
```

RSS token 只保存 SHA-256 摘要，不保存明文。

## 管理用户

管理员用户通过本地 `9101` 接口由 CLI 管理。删除用户时，`--username` 和 `--id` 只能二选一。

列出所有用户：

```shell
sudo meow-commentctl admin-user list \
    --config /opt/meow-comment/config.json
```

按用户名删除用户：

```shell
sudo meow-commentctl admin-user delete \
    --config /opt/meow-comment/config.json \
    --username reader
```

也可以按用户 ID 删除：

```shell
sudo meow-commentctl admin-user delete \
    --config /opt/meow-comment/config.json \
    --id USER_ID
```
