# API

## 获取验证码

### `GET /api/verification`

响应参数：

```json
{
    "uuid": "验证码 UUID",
    "captcha_base64": "验证码图片 Base64"
}
```

## 提交评论

### `POST /api/comment`

请求头：

```http
Content-Type: application/json
Origin: https://blog.xxx.com
```

请求参数：

```json
{
    "username": "username",
    "email": "email",
    "comments": "comments",
    "source_path": "/page/xxx",
    "page_title": "页面标题",
    "verification_uuid": "验证码 UUID",
    "verification_code": "用户输入的验证码"
}
```

服务端校验：

- `Origin` / `Referer` 必须来自允许的网站，例如 `blog.xxx.com`。
- email 格式检查
- 校验验证码 UUID 和验证码内容。

服务端留存：

- `user_agent`
- `ip_address`
- `origin`
- `referer`

## RSS

### `GET /api/rss?token=rss_token`

请求示例：

```http
GET /api/rss?token=rss_token HTTP/1.1
Accept: application/rss+xml
```

响应示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Meow Comment RSS</title>
        <link>https://site_url</link>
        <description>Meow</description>
        <item>
            <title>username | 页面标题</title>
            <pubDate>评论日期 UTC 时区</pubDate>
            <description><![CDATA[
                /page/xxx
                <br />
                username | username@example.com
                <br />
                评论主体内容
            ]]></description>
        </item>
    </channel>
</rss>
```

## 管理接口

Admin port

### Port `9100`

前端和 webui 使用的接口。

### Port `9101`

- local admin port
- Cli control service
- only local cli only

所有管理接口错误响应格式如下：

```json
{
    "code": "error_code",
    "message": "错误描述"
}
```

### 登录

### `POST /api/admin/auth/login`

请求头：

```http
Content-Type: application/json
Origin: https://comment.xxx.com
```

请求参数：

```json
{
    "username": "admin",
    "password": "首次登录时收到的随机密码"
}
```

响应参数：

```json
{
    "access_token": "meow_comment_session_xxx",
    "token_type": "Bearer",
    "expires_at": "2026-08-22T12:00:00Z",
    "user": {
        "id": "用户 UUID",
        "username": "admin",
        "role": "admin",
        "must_change_password": true,
        "authentication_methods": [
            "password"
        ],
        "created_at": "2026-08-22T12:00:00Z"
    }
}
```

登录成功后，后续请求使用：

```http
Authorization: Bearer meow_comment_session_xxx
```

### 获取当前用户

### `GET /api/admin/auth/me`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

响应参数：

```json
{
    "user": {
        "id": "用户 UUID",
        "username": "admin",
        "role": "admin",
        "must_change_password": false,
        "authentication_methods": [
            "password"
        ],
        "created_at": "2026-08-22T12:00:00Z"
    }
}
```

### 修改密码

### `POST /api/admin/auth/password`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
Content-Type: application/json
```

请求参数：

```json
{
    "current_password": "当前密码",
    "new_password": "新的密码"
}
```

密码长度必须为 12 至 128 个字符。修改成功后会使该用户原有 session 失效，并返回新的登录响应。

### 退出登录

### `POST /api/admin/auth/logout`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

成功响应状态码为 `204 No Content`。

### 用户列表

### `GET /api/admin/users`

User Permission: `Manage users`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

响应参数：

```json
[
    {
        "id": "用户 UUID",
        "username": "reader",
        "role": "viewer",
        "must_change_password": true,
        "authentication_methods": [
            "password"
        ],
        "created_at": "2026-08-22T12:00:00Z"
    }
]
```

### 创建查看或审核用户

### `POST /api/admin/users`

User Permission: `Manage users`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
Content-Type: application/json
```

请求参数：

```json
{
    "username": "reader",
    "role": "reviewer"
}
```

响应参数：

```json
{
    "id": "用户 UUID",
    "username": "reader",
    "role": "reviewer",
    "must_change_password": true,
    "authentication_methods": [
        "password"
    ],
    "created_at": "2026-08-22T12:00:00Z",
    "temporary_password": "服务端生成的随机密码"
}
```

### `PATCH /api/admin/users/{id}`

User Permission: `Manage users`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
Content-Type: application/json
```

请求参数：

```json
{
    "role": "reviewer"
}
```

成功响应为更新后的用户对象。

### `POST /api/admin/users/{id}/password`

User Permission: `Manage users`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

成功响应状态码为 `200 OK`：

```json
{
    "id": "用户 UUID",
    "username": "reader",
    "role": "viewer",
    "must_change_password": true,
    "authentication_methods": [
        "password"
    ],
    "created_at": "2026-08-22T12:00:00Z",
    "temporary_password": "服务端生成的一次性临时密码"
}
```

### 删除普通用户

### `DELETE /api/admin/users/{id}`

User Permission: `Manage users`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

成功响应状态码为 `204 No Content`。

### 查看评论

### `GET /api/admin/comments?limit=50&offset=0`

User Permission: `View comments`

请求头：

```http
Authorization: Bearer meow_comment_session_xxx
```

响应参数：

```json
{
    "items": [
        {
            "id": "评论 UUID",
            "username": "username",
            "email": "username@example.com",
            "comments": "评论主体内容",
            "source_path": "/page/xxx",
            "page_title": "页面标题",
            "completed": false,
            "created_at": "2026-08-22T12:00:00Z"
        }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
}
```

### 标记评论完成

### `PATCH /api/admin/comments/{id}`

User Permission: `Mark comments as complete`

```http
Authorization: Bearer meow_comment_session_xxx
Content-Type: application/json
```

请求参数：

```json
{
    "completed": true
}
```

响应参数为更新后的评论对象：

```json
{
    "id": "评论 UUID",
    "username": "username",
    "email": "username@example.com",
    "comments": "评论主体内容",
    "source_path": "/page/xxx",
    "page_title": "页面标题",
    "completed": true,
    "created_at": "2026-08-22T12:00:00Z"
}
```
