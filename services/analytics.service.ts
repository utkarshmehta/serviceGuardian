import { Streak, MonthlyMost } from '../types/models';
import db from '../database';
import { RunResult } from 'sqlite3';

/**
 * Calculates streaks of days with increasing meat bar consumption.
 * A streak is a sequence of days where each day's consumption
 * is greater than the previous day's.
 */
export async function getConsumptionStreaks(): Promise<Streak[]> {

  const sql = `
    WITH DailyConsumption AS (
      -- Step 1: Count consumptions for each day
      SELECT
        DATE(eaten_at) AS consumption_date,
        COUNT(id) AS daily_count
      FROM meat_bars
      GROUP BY consumption_date
    ),
    ConsumptionWithLag AS (
      -- Step 2: Compare each day's count to the previous day
      SELECT
        consumption_date,
        daily_count,
        LAG(daily_count, 1, 0) OVER (ORDER BY consumption_date) AS prev_day_count
      FROM DailyConsumption
    ),
    StreakGroups AS (
      -- Step 3: Identify the start of a new streak
      SELECT
        consumption_date,
        daily_count,
        (CASE WHEN daily_count > prev_day_count THEN 0 ELSE 1 END) AS is_new_streak
      FROM ConsumptionWithLag
    ),
    StreakIdentifiers AS (
      -- Step 4: Assign a unique ID to each streak
      SELECT
        consumption_date,
        daily_count,
        SUM(is_new_streak) OVER (ORDER BY consumption_date) AS streak_id
      FROM StreakGroups
    )
    -- Step 5: Select only the streaks (where count > 1)
    SELECT
      streak_id,
      COUNT(*) AS streak_length,
      MIN(consumption_date) AS streak_start,
      MAX(consumption_date) AS streak_end,
      GROUP_CONCAT(daily_count, ', ') AS streak_counts
    FROM StreakIdentifiers
    GROUP BY streak_id
    HAVING COUNT(*) > 1 -- A streak must be at least 2 days long
    ORDER BY streak_start;
  `;

  // use a Promise to handle the async database call
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err: Error | null, rows: any[]) => {
      if (err) {
        console.error('Error in getConsumptionStreaks:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * For each month, finds the day of the month
 * with the highest number of consumptions.
 */
export async function getMonthlyMostEaten(): Promise<MonthlyMost[]> {
  const sql = `
    WITH DailyConsumption AS (
      -- Step 1: Count consumptions for each day
      SELECT
        DATE(eaten_at) AS consumption_date,
        COUNT(id) AS daily_count
      FROM meat_bars
      GROUP BY consumption_date
    ),
    MonthlyDayCounts AS (
      -- Step 2: Extract month and day, keep the count
      SELECT
        STRFTIME('%Y-%m', consumption_date) AS consumption_month,
        STRFTIME('%d', consumption_date) AS day_of_month,
        daily_count
      FROM DailyConsumption
    ),
    RankedByMonth AS (
      -- Step 3: Rank days within each month by count, descending
      SELECT
        consumption_month,
        day_of_month,
        daily_count,
        ROW_NUMBER() OVER (
          PARTITION BY consumption_month 
          ORDER BY daily_count DESC
        ) AS rank_num
      FROM MonthlyDayCounts
    )
    -- Step 4: Select only the #1 ranked day for each month
    SELECT
      consumption_month,
      day_of_month,
      daily_count
    FROM RankedByMonth
    WHERE rank_num = 1
    ORDER BY consumption_month;
  `;

  return new Promise((resolve, reject) => {
    db.all(sql, [], (err: Error | null, rows: any[]) => {
      if (err) {
        console.error('Error in getMonthlyMostEaten:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Adds a new meat bar consumption to the database.
 * Also ensures the person exists in the people table.
 */
export function addConsumption(
  person_name: string,
  type: string,
  eaten_at: string,
): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    // 1. First, ensure the person exists in the 'people' table
    // INSERT OR IGNORE will add them if they are new, or do nothing if they exist.
    const insertPersonSql = 'INSERT OR IGNORE INTO people (name) VALUES (?)';

    db.run(insertPersonSql, [person_name], (err: Error | null) => {
      if (err) {
        console.error('Error ensuring person exists:', err.message);
        return reject(err);
      }

      // 2. Then, insert the consumption record
      const insertConsumptionSql =
        'INSERT INTO meat_bars (person_name, type, eaten_at) VALUES (?, ?, ?)';

      db.run(
        insertConsumptionSql,
        [person_name, type, eaten_at],
        function (this: RunResult, err: Error | null) {
          if (err) {
            console.error('Error inserting meat bar:', err.message);
            reject(err);
          } else {
            // Resolve with the ID of the new row
            resolve({ id: this.lastID });
          }
        },
      );
    });
  });
}


/**
 * Updates the monthly stats for a specific user and month.
 * Call this after adding a new consumption record.
 */
export function updateMonthlyStats(personName: string, month: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO monthly_stats (person_name, month, num_bars_consumed, most_consumed_bar_type)
      WITH MonthlyCounts AS (
          SELECT type, COUNT(*) as type_count
          FROM meat_bars
          WHERE person_name = ? AND strftime('%Y-%m', eaten_at) = ?
          GROUP BY type
      ),
      Ranked AS (
          SELECT type, type_count, ROW_NUMBER() OVER (ORDER BY type_count DESC) as rn
          FROM MonthlyCounts
      ),
      Totals AS (
          SELECT SUM(type_count) as total FROM MonthlyCounts
      )
      SELECT ?, ?, t.total, r.type
      FROM Ranked r, Totals t
      WHERE r.rn = 1;
    `;

    db.run(sql, [personName, month, personName, month], (err) => {
      if (err) {
        console.error('Error updating monthly stats:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}