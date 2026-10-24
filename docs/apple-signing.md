# Signing for Apple: the Mac installer and the iPad app

Once the Apple Developer Program membership is active, these steps give the GitHub builds what
they need to:

- **sign and notarise the Mac installer** (.dmg), so Macs open it without the "Apple cannot
  check it" warning (`.github/workflows/desktop.yml`);
- **build the iPad app and send it to TestFlight** (`.github/workflows/ios.yml`).

Everything is done in a web browser plus a few commands in **Git Bash** on Windows (it comes
with Git for Windows and includes `openssl`). No Mac is needed. Each value goes into the
repository's secrets: **GitHub > the repository > Settings > Secrets and variables > Actions >
New repository secret**. Until a secret is there, the builds carry on as before.

Keep the files these steps make (the `.key`, `.p12` and `.p8` files) somewhere safe and private,
such as a password manager. Never put them in the repository or a shared folder.

## 1. Your Team ID

developer.apple.com > Account > **Membership details** shows a 10-character **Team ID**.

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | the Team ID |

## 2. A certificate request (once, for both certificates)

In Git Bash, in a private folder:

```bash
openssl genrsa -out apple.key 2048
openssl req -new -key apple.key -out apple.csr -subj "/emailAddress=YOUR_EMAIL/CN=YOUR NAME/C=US"
```

## 3. The Mac certificate (Developer ID Application)

1. developer.apple.com > Account > **Certificates** > **+** > **Developer ID Application** >
   Continue. Upload `apple.csr` and download the certificate (`developerID_application.cer`).
2. In Git Bash, turn it into one password-protected file, then into text for GitHub:

```bash
openssl x509 -inform DER -in developerID_application.cer -out developerID.pem
openssl pkcs12 -export -legacy -inkey apple.key -in developerID.pem -out developerID.p12 -passout pass:CHOOSE_A_PASSWORD
base64 -w0 developerID.p12 > developerID.p12.txt
```

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | everything in `developerID.p12.txt` |
| `APPLE_CERTIFICATE_PASSWORD` | the password you chose |
| `APPLE_SIGNING_IDENTITY` | the certificate's full name as the Certificates page shows it, e.g. `Developer ID Application: Your Name (TEAMID)` |

## 4. The App Store Connect API key (notarising and TestFlight)

appstoreconnect.apple.com > **Users and Access** > **Integrations** > **App Store Connect API** >
Team Keys > **+**. Name it "GitHub builds", access **App Manager**, Generate. Download the key
(`AuthKey_XXXXXXXXXX.p8`): Apple lets you download it only once.

| Secret | Value |
|---|---|
| `APPLE_API_KEY_ID` | the key's **Key ID** |
| `APPLE_API_ISSUER` | the **Issuer ID** shown above the list of keys |
| `APPLE_API_KEY_P8` | everything in the `.p8` file (open it in Notepad) |

With steps 1 to 4 done, the next Mac build is signed and notarised.

## 5. The iPad app

1. **The app's ID**: developer.apple.com > Account > **Identifiers** > **+** > App IDs > App.
   Description "Chem Illustrator", Bundle ID **Explicit**: `io.github.nathanohare.chemillustrator`.
2. **The distribution certificate**: Certificates > **+** > **Apple Distribution**. Upload the same
   `apple.csr`, download `distribution.cer`, then in Git Bash:

```bash
openssl x509 -inform DER -in distribution.cer -out distribution.pem
openssl pkcs12 -export -legacy -inkey apple.key -in distribution.pem -out distribution.p12 -passout pass:CHOOSE_A_PASSWORD
base64 -w0 distribution.p12 > distribution.p12.txt
```

3. **The provisioning profile**: Profiles > **+** > **App Store Connect** (under Distribution).
   Pick the Chem Illustrator App ID and the Apple Distribution certificate, name it "Chem
   Illustrator App Store", download it, then:

```bash
base64 -w0 Chem_Illustrator_App_Store.mobileprovision > profile.txt
```

| Secret | Value |
|---|---|
| `IOS_CERTIFICATE` | everything in `distribution.p12.txt` |
| `IOS_CERTIFICATE_PASSWORD` | its password |
| `IOS_MOBILE_PROVISION` | everything in `profile.txt` |

4. **The app in App Store Connect**: appstoreconnect.apple.com > **Apps** > **+** > New App.
   Platform iOS, name "Chem Illustrator", language English, Bundle ID the one from step 1, SKU
   `chem-illustrator`.

Then add a repository **variable** (Settings > Secrets and variables > Actions > **Variables** tab)
named `TESTFLIGHT` with the value `on`. The next merge into main (or Actions > iPad app > Run
workflow) builds the iPad app and sends it to TestFlight. In App Store Connect > the app > **TestFlight**, add yourself and labmates as
testers; they install the free TestFlight app on their iPads and get each new build there.

## Renewing

The certificates last five years (Developer ID) and one year (Apple Distribution); the
provisioning profile lasts a year. To renew, repeat steps 3 or 5 with the same `apple.key` and
replace the secrets.
