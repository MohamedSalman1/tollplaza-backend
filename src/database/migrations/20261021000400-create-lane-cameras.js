'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // One lane has many cameras: several physical cameras per lane, and one
    // camera may report under more than one name.
    await queryInterface.createTable('lane_cameras', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      plaza_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'plazas', key: 'id' },
      },
      lane_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'lanes', key: 'id' },
        onDelete: 'CASCADE',
      },
      camera_name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: 'Free-text label: lpr | rear | axle | ...',
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

    await queryInterface.addIndex('lane_cameras', ['plaza_id', 'camera_name'], {
      unique: true,
      name: 'uq_lane_cameras_plaza_camera',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lane_cameras');
  },
};
