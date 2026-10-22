'use strict';

// Hard vs soft alerts. Soft alerts (DESC_MISMATCH) rest only on the AI image
// description and produce more false alarms, so crossings keep a second
// alert summary covering hard alerts only. The existing alert_* columns
// still cover every alert. Keep SOFT_TYPES in step with SOFT_ALERT_TYPES in
// libs/entities/src/constants/constants.ts.
const SOFT_TYPES = ['DESC_MISMATCH'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('crossings', 'hard_alert_count', {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Alerts other than soft (description-only) ones',
    });
    await queryInterface.addColumn('crossings', 'hard_alert_max_severity', {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '3 = HIGH, 2 = MED, 1 = LOW, 0 = none (hard alerts only)',
    });
    await queryInterface.addColumn('crossings', 'hard_alert_loss', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Backfill from the alerts already stored (one-off; crossings are
    // otherwise never updated)
    await queryInterface.sequelize.query(
      `UPDATE crossings c
       JOIN (
         SELECT crossing_id, COUNT(*) AS n, MAX(severity_rank) AS s, SUM(loss) AS l
         FROM crossing_alerts
         WHERE type NOT IN (?)
         GROUP BY crossing_id
       ) a ON a.crossing_id = c.id
       SET c.hard_alert_count = a.n,
           c.hard_alert_max_severity = a.s,
           c.hard_alert_loss = a.l`,
      { replacements: [SOFT_TYPES] },
    );

    // has_alerts (hard by default) and the live wall's "alerts only"
    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'hard_alert_max_severity', 'crossed_at'],
      { name: 'ix_crossings_plaza_hard_severity' },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'crossings',
      'ix_crossings_plaza_hard_severity',
    );
    for (const name of [
      'hard_alert_count',
      'hard_alert_max_severity',
      'hard_alert_loss',
    ]) {
      await queryInterface.removeColumn('crossings', name);
    }
  },
};
