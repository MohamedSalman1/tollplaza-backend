'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plazas', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Sent by the camera service as plaza_code, e.g. nagpur-champa',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      timezone: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'Asia/Kolkata',
      },
      home_state_codes: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'State codes that are not out-of-state, e.g. ["MH","BH"]',
      },
      media_base_url: {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'Prefix for relative image/video paths',
      },
      status: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '1 = active, 0 = inactive (ingest rejected)',
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plazas');
  },
};
