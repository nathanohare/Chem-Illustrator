# Signing the Windows app with Azure Artifact Signing

Windows SmartScreen warns about ("Windows protected your PC") any program that is not signed
with a code-signing certificate. Microsoft's **Azure Artifact Signing** (called Trusted Signing
until 2025) gives individual developers in the United States and Canada a certificate for a
small monthly fee, and signs the files in the cloud, so there is no certificate file to look
after. Once the steps below are done, every build of main signs the app, the setup `.exe` and
the `.msi` (`.github/workflows/desktop.yml`). Until then the builds carry on unsigned.

Everything is done in the Azure portal (portal.azure.com) and on GitHub, in a web browser.

## 1. Check you can use it

- **Where you live**: individual developers must be in the US or Canada.
- **A paid subscription**: Azure > **Subscriptions** must show a pay-as-you-go subscription
  (a free trial can be upgraded to pay-as-you-go: Subscriptions > the subscription > Upgrade).
- **The billing account is yours as an individual**: Azure > **Cost Management + Billing** >
  **Billing scopes** > your billing account > **Properties**. The **Account type** must be
  **Individual**, and the name and sold-to address must match your driver's licence or passport
  exactly, because the identity check compares them. Fix them here first if they differ.
- **The cost**: the Basic tier (5,000 signatures a month, far more than the builds use) is about
  US$10 a month; check the current price at
  azure.microsoft.com/pricing/details/artifact-signing. Each build signs three files.

## 2. Switch the service on

Subscriptions > your subscription > **Settings > Resource providers**. Search for
**Microsoft.CodeSigning**, select it and click **Register**. It takes a minute to show
**Registered**.

## 3. Make the signing account

1. Search the portal for **Artifact Signing Accounts** > **Create**.
2. Subscription: yours. Resource group: **Create new**, `chem-illustrator-signing`.
3. Account name: something like `ChemIllustrator` (3 to 24 letters and numbers, unique across
   Azure, must not start with "one").
4. Region: **East US** (any region works; note the endpoint for the one you choose:
   East US is `https://eus.codesigning.azure.net`, West US 2 is
   `https://wus2.codesigning.azure.net`, Central US is `https://cus.codesigning.azure.net`).
5. Pricing: **Basic**. Review + Create > Create > Go to resource.

## 4. Allow yourself to verify your identity

The **New identity** button stays grey until you have this role, even as the owner.

1. In the signing account: **Access control (IAM)** > **Add** > **Add role assignment**.
2. Search for **Artifact Signing Identity Verifier**, select it, Next.
3. **Select members** > pick yourself > Review + assign.

## 5. Verify your identity

1. In the signing account: **Identity validations** > **New identity** > **Public**.
2. Choose **Individual**. Fill in your name and address exactly as on your ID and billing
   account, and your email.
3. Submit. Microsoft emails a link to finish the check: it asks for a photo of a
   government-issued ID and a selfie, through Microsoft's verification partner.
4. The request shows **In Progress**, then **Completed**. Microsoft says this takes 1 to 20
   business days. If it shows **Action Required**, follow the email. A request with a mistake
   cannot be edited: make a new one.

## 6. Make the certificate profile (after the identity is Completed)

1. In the signing account: **Certificate profiles** > **Create** > **Public Trust**.
2. Name: `ChemIllustratorPublic` (5 to 100 letters and numbers).
3. **Verified CN and O**: pick your completed identity. Leave the street address and postal
   code unticked, so they are not printed in the certificate. Create.

## 7. A login for GitHub (app registration)

1. Search the portal for **App registrations** > **New registration**. Name
   `chem-illustrator-github-signing`, "Accounts in this organizational directory only",
   no redirect URI. Register.
2. On its **Overview**, copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. **Certificates & secrets** > **Client secrets** > **New client secret**. Description
   `GitHub Actions`, expiry 24 months (the longest the portal offers). Copy the **Value** now:
   it is shown only once.
4. Back in the signing account: **Access control (IAM)** > **Add** > **Add role assignment** >
   **Artifact Signing Certificate Profile Signer** > Next > **Select members** > search for
   `chem-illustrator-github-signing` (app registrations are found by name) > Review + assign.

## 8. Put the values into GitHub

GitHub > the repository > **Settings > Secrets and variables > Actions**.

On the **Secrets** tab, **New repository secret** for each:

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | the Application (client) ID |
| `AZURE_TENANT_ID` | the Directory (tenant) ID |
| `AZURE_CLIENT_SECRET` | the client secret's Value |

On the **Variables** tab (these are not secret), **New repository variable** for each:

| Variable | Value |
|---|---|
| `AZURE_SIGNING_ENDPOINT` | the region's endpoint, e.g. `https://eus.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | the signing account's name, e.g. `ChemIllustrator` |
| `AZURE_SIGNING_PROFILE` | the certificate profile's name, e.g. `ChemIllustratorPublic` |

## 9. Try it

Actions > **Desktop app** > **Run workflow** (any branch). In the Windows job, the step "Sign
the Windows app and installers" should install the signing tool rather than say nothing is
signed, and the build should finish. Download the installer from the run, right-click it >
**Properties** > **Digital Signatures**: it should show your name.

SmartScreen may still warn for the first few days of a new certificate, until enough people
have run signed copies; it stops on its own.

## Renewing

The certificates themselves renew automatically every few days; nothing to do. The client
secret expires after the time chosen in step 7: before then, make a new one and replace
`AZURE_CLIENT_SECRET`. If a build ever says the secret is invalid, that is why.
