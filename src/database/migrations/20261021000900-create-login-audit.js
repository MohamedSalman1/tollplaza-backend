'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Every login attempt (replaces the dashboard's ipapi.co + formsubmit.co
    // logging from the browser). Location is filled in after the login
    // response by a server-side ipapi lookup.
    await queryInterface.createTable('login_audit', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        comment: 'NULL when the email matched no user',
      },
      email_attempted: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      ip: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      success: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
      failure_reason: {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: 'unknown_email | wrong_password | inactive',
      },
      geo_country: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      geo_region: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      geo_city: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      geo_org: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'ISP / organisation',
      },
      geo_raw: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Full ipapi response',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('login_audit', ['user_id', 'created_at'], {
      name: 'ix_login_audit_user',
    });
    await queryInterface.addIndex('login_audit', ['created_at'], {
      name: 'ix_login_audit_time',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('login_audit');
  },
};
