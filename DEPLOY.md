# Déploiement TeamPulse

Le backend est hébergé sur **Railway**, l'app mobile est distribuée via le
**Play Store**. Les deux sont liés par une seule variable : `EXPO_PUBLIC_API_URL`.

> **Important** : l'URL du backend est compilée dans le bundle JavaScript de
> l'app. Changer l'URL du serveur impose donc un nouveau build et un nouvel
> envoi sur le Play Store — un simple redéploiement Railway ne suffit pas.

---

## 1. Backend sur Railway

### 1.1 Créer le service

1. Railway → **New Project** → **Deploy from GitHub repo** → `Teampluse`.
2. Ouvrir le service → **Settings** → **Root Directory** = `backend`.
   Le dépôt contient `backend/` et `mobile/` ; sans ça Railway tente de
   construire le mauvais dossier.
3. **Redeploy.** Le premier build déclenché à la connexion de GitHub échoue
   toujours : il part de la racine du dépôt, où il n'y a aucune application à
   détecter (`Railpack failed to prepare the build`). C'est attendu, il suffit
   de relancer une fois le Root Directory réglé.
4. `backend/railway.json` fournit la commande de build, la commande de
   démarrage et le healthcheck — il n'y a rien à saisir dans l'interface. Ce
   fichier n'est lu qu'une fois le Root Directory correct, puisqu'il se trouve
   dans `backend/`.

### 1.2 Ajouter la base de données

**New** → **Database** → **Add PostgreSQL**, dans le même projet.

Le service Postgres expose deux URL de connexion :

| Variable | Hôte | Usage |
|---|---|---|
| `DATABASE_URL` | `postgres.railway.internal` | **À utiliser.** Réseau privé, pas de frais de sortie, pas de TLS → `DB_SSL=false` |
| `DATABASE_PUBLIC_URL` | `*.proxy.rlwy.net` | Accès depuis l'extérieur (pgAdmin, psql local). Nécessite `DB_SSL=true` |

Ne jamais recopier l'URL à la main dans le service backend : utiliser la
**référence** `${{Postgres.DATABASE_URL}}`. Railway la résout à chaque
déploiement, donc une rotation du mot de passe côté base se propage toute
seule. Une valeur copiée en dur, elle, deviendrait silencieusement obsolète.

> Le réseau privé n'est initialisé qu'au démarrage du conteneur, pas pendant le
> build. Les premières tentatives de connexion peuvent échouer : TypeORM
> réessaie automatiquement (10 fois), ce n'est pas une erreur.

### 1.3 Variables d'environnement

Service backend → **Variables** :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence, pas une valeur en dur) |
| `DB_SSL` | `false` |
| `DB_SYNCHRONIZE` | `false` (défaut) — ne jamais activer en production, voir §1.6 |
| `JWT_SECRET` | **Obligatoire.** Chaîne aléatoire longue, différente de celle du poste local. Sans elle l'application refuse de démarrer — c'est voulu : elle se rabattait avant sur une valeur écrite en clair dans le dépôt, ce qui permettait de forger un jeton pour n'importe quel compte |
| `JWT_EXPIRATION` | `7d` |
| `BREVO_API_KEY` *ou* `SENDGRID_API_KEY` | **Obligatoire en production.** Voir la section E-mail ci-dessous — le SMTP ne fonctionne pas sur Railway |
| `MAIL_FROM` | Adresse expéditrice, vérifiée chez le fournisseur. Par défaut `MAIL_USER` |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | SMTP, utile en local seulement |
| `APP_URL` | `https://<ton-domaine>.up.railway.app` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (référence). Sans elle, le temps réel fonctionne mais reste limité à une instance |
| `CORS_ORIGINS` | `*` |
| `CLOUDINARY_CLOUD_NAME` | … |
| `CLOUDINARY_API_KEY` | … |
| `CLOUDINARY_API_SECRET` | … |

À ne **pas** définir :

- `PORT` — injecté automatiquement par Railway (`8080`), l'écraser casse le routage.
- `NODE_ENV=production` — inutile ici et source d'effets de bord au build.

### 1.4 Exposer le service

**Settings** → **Networking** → **Generate Domain**.

Railway injecte sa propre variable `PORT` (aujourd'hui `8080`), et `main.ts`
l'utilise via `process.env.PORT`. Le **target port** du domaine doit donc
correspondre à cette valeur, pas à 3000. Vérifie la ligne du domaine dans
Networking : si le port affiché ne correspond pas à celui du log
`Server listening on port ...`, corrige-le, sinon l'edge renvoie
`502 Application failed to respond` alors que l'application tourne très bien.

### 1.5 Vérifier

```bash
curl https://<ton-domaine>.up.railway.app/api/health
# {"status":"ok","uptime":12.34,"realtime":"redis",
#  "services":{"mail":true,"uploads":true,"turn":false}}
```

`services` indique quelles intégrations sont configurées. C'est important
parce que l'envoi d'OTP et les uploads **échouent en silence** : l'envoi de
l'e-mail est en fire-and-forget (`auth.service.ts`), l'API répond « compte
créé » même si aucun message ne part. Si `mail` est `false`, aucun code de
vérification n'arrivera jamais et rien ne le signalera côté application.

`realtime` dit si le temps réel est partagé entre instances :

- `"redis"` → `REDIS_URL` est en place, plusieurs réplicas sont possibles
- `"memory"` → repli, une seule instance supportée

`uptime` sert aussi à vérifier qu'un changement de variable a bien été
appliqué : sur Railway une variable modifiée reste **en attente** tant que la
barre **Deploy** n'est pas validée, et rien ne le signale. Si l'uptime continue
de monter au lieu de repartir de zéro, le changement n'a pas été pris.

Si ça répond, le backend est en ligne. Sinon, regarder les **Deploy Logs**.

### 1.6 Schéma et migrations

`DB_SYNCHRONIZE` vaut **`false` par défaut** et doit le rester en production.
Activé, TypeORM aligne le schéma sur les entités à chaque démarrage et peut
**supprimer une colonne, donc des données**, dès qu'un champ est renommé.

Le schéma évolue par migrations, appliquées **automatiquement au démarrage**
(`migrationsRun: true`) : Railway n'offre pas d'étape de déploiement séparée
où les lancer à la main.

`src/migrations/…-Baseline.ts` reconstitue le schéma tel que `synchronize` le
créait. Sur une base déjà peuplée, elle détecte la table `users` et se
contente de s'enregistrer comme appliquée, sans rien toucher.

**Faire évoluer le schéma :**

```bash
# 1. modifier l'entité, puis générer la migration correspondante
npm run migration:generate -- src/migrations/NomDuChangement

# 2. relire le SQL produit — surtout les DROP COLUMN
# 3. appliquer en local
npm run migration:run

# 4. commiter la migration ; la production l'appliquera au redémarrage
```

`npm run migration:show` liste l'état, `npm run migration:revert` annule la
dernière. Revenir sur la migration de référence est bloqué : elle supprimerait
toutes les tables, et il faut `ALLOW_BASELINE_DOWN=true` pour le faire
sciemment.

**Sauvegardes.** Les migrations protègent d'une perte accidentelle, pas d'une
erreur dans un `DROP COLUMN` écrit à la main. Activer les sauvegardes
automatiques du Postgres Railway avant d'ouvrir le service à de vrais
utilisateurs.

### 1.7 Tests d'intégration

```bash
cd backend
DB_PASSWORD=<mot de passe postgres> npm run test:e2e
```

La campagne recrée une base jetable (`teampulse_e2e`), y applique les
migrations comme en production, puis exerce l'API réelle : cloisonnement entre
organisations, application des rôles, révocation immédiate d'un compte,
suppression de compte et canal d'accueil.

Le limiteur de débit et le transport e-mail sont neutralisés pendant les
tests (`THROTTLE_DISABLED`, variables `MAIL_*` vidées) : ils ne sont donc pas
couverts, contrairement à tout le reste du chemin HTTP.

À lancer avant chaque déploiement touchant l'authentification, les rôles ou
les salons.

---

## 2. App mobile

### 2.1 Renseigner l'URL

Dans `mobile/eas.json`, remplacer le placeholder dans **les deux profils**
(`preview` et `production`) :

```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://<ton-domaine>.up.railway.app"
}
```

Sans `https://`, ou avec un `/` final, ça ne marchera pas — le code retire le
slash final mais attend le schéma complet.

### 2.2 Tester avant de publier

```bash
cd mobile
eas build -p android --profile preview
```

Produit un APK installable directement sur un téléphone. **Toujours valider
par ce canal avant d'envoyer sur le Play Store** : une erreur d'URL redonnerait
exactement l'erreur serveur actuelle, mais cette fois auprès des utilisateurs.

### 2.3 Build de production

```bash
cd mobile
eas build -p android --profile production
```

`appVersionSource: "remote"` + `autoIncrement: true` incrémentent le
`versionCode` automatiquement — obligatoire, la Play Console refuse un
`versionCode` déjà utilisé.

Puis envoyer le `.aab` sur la Play Console.

---

## 3. Développement local

Rien ne change. Les profils `development` n'ont pas de `EXPO_PUBLIC_API_URL` :
l'app détecte l'IP du serveur Metro via `expo-constants` comme avant. Pour
forcer une adresse : `EXPO_PUBLIC_API_HOST=192.168.1.42`.

---

## 4. Limites connues

- **Réplicas.** `numReplicas: 1` dans `railway.json`, mais le code supporte
  désormais plusieurs instances dès lors que `REDIS_URL` est définie :
  l'adapter Redis relaie les diffusions Socket.IO, l'identité de l'utilisateur
  est portée par `socket.data` (visible depuis toutes les instances via
  `fetchSockets()`), et l'état des appels est partagé dans Redis. Augmenter
  `numReplicas` est sûr une fois `REDIS_URL` en place — et seulement à ce
  moment-là.
- **Appels WebRTC.** La signalisation passe par Socket.IO. Le média est en
  pair-à-pair : voir la section TURN ci-dessous.
- **Plan Railway.** Sur le plan gratuit, le service peut être mis en veille et
  la première requête après inactivité met plusieurs secondes à répondre.

---

## 5. TURN (appels audio/vidéo)

La signalisation WebRTC passe par Socket.IO, mais l'audio et la vidéo vont
directement d'un téléphone à l'autre. STUN suffit à découvrir l'adresse
publique dans la plupart des cas ; derrière un **NAT symétrique** — fréquent
sur les réseaux mobiles — la connexion directe est impossible et il faut
relayer le flux par un serveur **TURN**. Sans lui, l'appel semble aboutir mais
reste muet et sans image.

### Configuration

Les serveurs ICE sont servis par `GET /api/calls/ice-servers` (authentifié) et
non écrits en dur dans l'application : les identifiants TURN tournent, et une
valeur embarquée dans le bundle imposerait une republication sur le Play Store
à chaque changement. Le client les récupère au moment de l'appel, avec un cache
de 10 minutes et un repli STUN si l'API est injoignable.

| Variable | Rôle |
|---|---|
| `TURN_URLS` | Liste séparée par des virgules, ex. `turn:host:3478,turns:host:5349` |
| `TURN_SECRET` | **Mode recommandé.** Secret partagé, identifiants éphémères dérivés par HMAC |
| `TURN_TTL_SECONDS` | Durée de validité de ces identifiants (défaut `86400`) |
| `TURN_USERNAME` / `TURN_PASSWORD` | Repli statique, utilisé seulement si `TURN_SECRET` est absent |
| `STUN_URLS` | Optionnel, deux serveurs Google par défaut |

Privilégier `TURN_SECRET` : le secret ne quitte jamais le serveur, et les
identifiants distribués expirent. Les identifiants statiques sont envoyés tels
quels à chaque client et ne changent jamais.

### Choisir un fournisseur

- **Service managé** (Twilio, Metered, Xirsys…) : le plus rapide. Facturé au
  Go relayé. Prendre l'option « identifiants éphémères » quand elle existe.
- **coturn auto-hébergé** : moins cher à volume élevé, mais demande un serveur
  avec IP publique et des ports ouverts. Lancer avec `--use-auth-secret` et
  `--static-auth-secret=<TURN_SECRET>` pour correspondre au mode recommandé.
  Railway ne convient pas : TURN a besoin d'UDP, que la plateforme ne route pas.

### Vérifier

Sans `TURN_URLS`, les logs affichent au premier appel :

```
WARN [Ice] TURN_URLS absente : appels en pair-a-pair uniquement.
```

Une fois configuré, `GET /api/calls/ice-servers` renvoie une entrée `turn:` en
plus des `stun:`, avec un `username` de la forme `<timestamp>:<userId>` en mode
éphémère.

---

## 6. E-mail

**Railway bloque le SMTP sortant.** Les ports 587 et 465 partent tous deux en
`ETIMEDOUT` : les paquets sont jetés sans refus, ce qui donne une connexion qui
pend plutôt qu'une erreur franche. Aucun réglage ne contourne ce blocage, et
les identifiants Gmail n'y sont pour rien — vérifiés valides par ailleurs.

La production doit donc passer par une **API HTTPS**, sur le port 443 que rien
ne bloque. `MailService` choisit son transport ainsi, dans l'ordre :

1. `BREVO_API_KEY` → API Brevo
2. `SENDGRID_API_KEY` → API SendGrid
3. `MAIL_HOST` + `MAIL_USER` + `MAIL_PASS` → SMTP, pour le développement local

### Le piège de l'expéditeur

La plupart de ces services exigent un **domaine vérifié** pour écrire à des
adresses quelconques. Sans domaine, il faut un fournisseur acceptant la
vérification d'un **expéditeur unique** :

- **Brevo** — 300 e-mails/jour gratuits, vérification d'une seule adresse.
  Le choix recommandé sans domaine.
- **SendGrid** — 100/jour, « Single Sender Verification » équivalente.
- **Resend** — API la plus simple, mais sans domaine vérifié on ne peut écrire
  qu'à sa propre adresse : inutilisable ici.

Vérifier l'adresse d'expédition chez le fournisseur, puis la renseigner dans
`MAIL_FROM` (ou laisser `MAIL_USER` faire office de valeur par défaut). Un
expéditeur non vérifié fait échouer l'envoi avec un message explicite, remonté
par l'endpoint de diagnostic ci-dessous.

### Vérifier

```bash
curl https://<ton-domaine>.up.railway.app/api/health/mail
# {"ok":true,"provider":"brevo","from":"..."}
```

Cet endpoint ouvre la connexion et valide les identifiants **sans envoyer de
message**. Il existe parce que l'envoi d'OTP est en fire-and-forget : l'API
répond « compte créé » même si aucun message ne part, et la seule autre trace
est une ligne de log dans le conteneur. Il est soumis au rate limiting, à la
différence du reste du healthcheck.
