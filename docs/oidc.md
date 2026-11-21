# OIDC Login

## Add an OIDC Source

In the admin console, open **Users**, click **Create**, and select **OIDC source**.

Fields:

- **Provider name**: A name to distinguish this login option.
- **Issuer URL**: Enter the issuer URL provided by the identity provider. Do not enter the Discovery document URL.
- **Client ID** and **Client secret**: Enter the values provided when you create an OIDC application with the identity provider.
- **Redirect URI**: Copy the URI shown in the admin console and add it to the allowed callback URLs for the identity provider application.

Server validation:

- The issuer and redirect URI must use HTTPS. HTTP is allowed only for localhost testing.
- The server requests the issuer's Discovery document and checks that it provides authorization and token endpoints.

Identity provider validation:

- During login, the identity provider validates the client credentials and checks that the redirect URI matches the URI registered for the application.

## Sign In

On the login page, select the OIDC source and sign in with the identity provider. A viewer account is created automatically on the first sign-in.

## Manage Accounts

In **Users**, select an OIDC source to view its accounts and assign the viewer or reviewer role. You can also update the source configuration.
