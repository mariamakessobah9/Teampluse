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
| `DB_SYNCHRONIZE` | `true` — **à passer à `false` après le premier déploiement réussi** |
| `JWT_SECRET` | **Obligatoire.** Chaîne aléatoire longue, différente de celle du poste local. Sans elle l'application refuse de démarrer — c'est voulu : elle se rabattait avant sur une valeur écrite en clair dans le dépôt, ce qui permettait de forger un jeton pour n'importe quel compte |
| `JWT_EXPIRATION` | `7d` |
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USER` | l'adresse d'envoi |
| `MAIL_PASS` | le mot de passe d'application Gmail |
| `APP_URL` | `https://<ton-domaine>.up.railway.app` |
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
# {"status":"ok","uptime":12.34}
```

Si ça répond, le backend est en ligne. Sinon, regarder les **Deploy Logs**.

### 1.6 Sécuriser le schéma

Une fois le premier déploiement passé et les tables créées, mettre
`DB_SYNCHRONIZE=false`. Laissé à `true`, TypeORM modifie le schéma à chaque
démarrage et peut **supprimer des colonnes et leurs données** lors d'un
changement d'entité. Les évolutions de schéma passeront ensuite par des
migrations TypeORM.

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

- **Une seule instance.** `numReplicas: 1` dans `railway.json`. Socket.IO garde
  l'état des connexions en mémoire : passer à plusieurs réplicas coupera le
  temps réel tant qu'un adapter Redis n'est pas en place.
- **Appels WebRTC.** La signalisation passe par Socket.IO, donc par Railway.
  Mais sans serveur **TURN**, les appels échoueront entre certains réseaux
  mobiles (NAT symétrique). STUN seul ne suffit pas dans tous les cas.
- **Plan Railway.** Sur le plan gratuit, le service peut être mis en veille et
  la première requête après inactivité met plusieurs secondes à répondre.
