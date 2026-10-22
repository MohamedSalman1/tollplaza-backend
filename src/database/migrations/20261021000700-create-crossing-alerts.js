'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Raised at ingest, never recomputed. Only the review columns change.
    // plaza_id, crossed_at and lane_id are copied from the crossing so lists
    // and counts don't need a join. No FK to crossings (it may be
    // partitioned later); ingest writes both in one transaction.
    await queryInterface.createTable('crossing_alerts', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      crossing_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      plaza_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      crossed_at: {
        type: Sequelize.DATE(3),
        allowNull: false,
        comment: 'UTC, copied from the crossing',
      },
      lane_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment:
          'TAG_MISMATCH | AXLE_MISMATCH | DESC_MISMATCH | EXEMPT_ANOMALY | HIGH_VALUE',
      },
      severity: {
        type: Sequelize.STRING(8),
        allowNull: false,
        comment: 'HIGH | MED | LOW',
      },
      severity_rank: {
        type: Sequelize.TINYINT,
        allowNull: false,
        comment: '3 = HIGH, 2 = MED, 1 = LOW',
      },
      charged_tag: {
        type: Sequelize.TINYINT,
        allowNull: true,
      },
      expected_tag: {
        type: Sequelize.STRING(8),
        allowNull: true,
        comment: 'A tag class, or e.g. "7+" for description mismatches',
      },
      loss: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Whole rupees, priced when the crossing was stored',
      },
      reason: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'open',
        comment: 'open | reviewed',
      },
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      review_note: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // One alert per type per crossing; also makes a retried insert a no-op
    await queryInterface.addIndex('crossing_alerts', ['crossing_id', 'type'], {
      unique: true,
      name: 'uq_crossing_alerts_crossing_type',
    });
    await queryInterface.addIndex(
      'crossing_alerts',
      ['plaza_id', 'status', 'severity_rank', 'crossed_at'],
      { name: 'ix_crossing_alerts_plaza_status' },
    );
    await queryInterface.addIndex(
      'crossing_alerts',
      ['plaza_id', 'crossed_at'],
      { name: 'ix_crossing_alerts_plaza_time' },
    );
    await queryInterface.addIndex(
      'crossing_alerts',
      ['plaza_id', 'type', 'crossed_at'],
      { name: 'ix_crossing_alerts_plaza_type' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('crossing_alerts');
  },
};
