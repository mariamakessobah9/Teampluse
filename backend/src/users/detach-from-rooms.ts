/** Tout ce qui sait executer du SQL brut : depot, EntityManager, QueryRunner. */
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> };

/**
 * Retire un compte de toutes ses conversations : suppression du compte par
 * son titulaire, ou retrait de l'organisation par un administrateur.
 *
 * Sans cela, le compte continue d'apparaitre dans la liste des membres de
 * chaque groupe et les conversations directes restent affichees chez les
 * collegues sous le nom « Compte supprime ». Une conversation directe privee
 * de l'un de ses deux membres disparait ensuite de la liste de l'autre (voir
 * ChatService.getUserRooms).
 *
 * Un groupe dont il etait administrateur passe a un autre membre plutot que
 * de rester sans personne pour le gerer.
 *
 * Renvoie les salons touches, pour prevenir leurs membres en temps reel.
 */
export async function detachUserFromRooms(
  db: Queryable,
  userId: string,
): Promise<string[]> {
  const rows: { chat_room_id: string }[] = await db.query(
    `SELECT "chat_room_id" FROM "chat_room_members" WHERE "user_id" = $1`,
    [userId],
  );

  await db.query(
    `UPDATE "chat_rooms" r
        SET "adminId" = (
          SELECT m."user_id" FROM "chat_room_members" m
           WHERE m."chat_room_id" = r."id" AND m."user_id" <> $1
           LIMIT 1
        )
      WHERE r."adminId" = $1`,
    [userId],
  );

  await db.query(`DELETE FROM "chat_room_members" WHERE "user_id" = $1`, [
    userId,
  ]);

  return rows.map((r) => r.chat_room_id);
}
