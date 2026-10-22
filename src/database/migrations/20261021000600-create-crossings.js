'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert-once, append-only: every derived value is computed at ingest and
    // rows are never updated afterwards.
    //
    // Partition-ready: crossed_at is part of the PK and the unique key so the
    // table can later be RANGE-partitioned by month without a rebuild. For the
    // same reason there are no foreign keys here (partitioned tables don't
    // support them); plaza_id and lane_id are checked by ingest.
    await queryInterface.createTable('crossings', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      crossed_at: {
        type: Sequelize.DATE(3),
        primaryKey: true,
        allowNull: false,
        comment: 'UTC',
      },
      plaza_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      source_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The camera service's id for this record",
      },
      lane_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'NULL when the camera has no lane mapping',
      },
      camera_name: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      license_plate: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      plate_normalized: {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: 'Uppercase, letters and digits only',
      },
      plate_bg_color: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      plate_text_color: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      state_name: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      state_code: {
        type: Sequelize.STRING(8),
        allowNull: true,
      },
      rto_code: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      district: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      region: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      vehicle_make: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      vehicle_model: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      vehicle_color: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      vehicle_class: {
        type: Sequelize.TINYINT,
        allowNull: true,
      },
      tag_class: {
        type: Sequelize.TINYINT,
        allowNull: true,
      },
      axles: {
        type: Sequelize.TINYINT,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_exempt: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      exempt_vehicle_class: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      is_ev: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_oos: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_commercial: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      unit_price: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Price of vehicle_class at ingest time, kept even when exempt',
      },
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Toll charged: 0 if exempt, otherwise unit_price',
      },
      alert_count: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
      },
      alert_max_severity: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '3 = HIGH, 2 = MED, 1 = LOW, 0 = none',
      },
      alert_loss: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      image_path: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      video_path: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      search_text: {
        type: Sequelize.STRING(1024),
        allowNull: true,
        comment: 'Lowercase blob for the q filter',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'source_id', 'crossed_at'],
      { unique: true, name: 'uq_crossings_plaza_source' },
    );
    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'crossed_at', 'id'],
      {
        name: 'ix_crossings_plaza_time',
      },
    );
    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'plate_normalized', 'crossed_at'],
      { name: 'ix_crossings_plaza_plate' },
    );
    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'lane_id', 'crossed_at'],
      { name: 'ix_crossings_plaza_lane' },
    );
    await queryInterface.addIndex(
      'crossings',
      ['plaza_id', 'alert_max_severity', 'crossed_at'],
      { name: 'ix_crossings_plaza_severity' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('crossings');
  },
};
