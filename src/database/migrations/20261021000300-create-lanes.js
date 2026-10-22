'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lanes', {
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
      number: {
        type: Sequelize.SMALLINT,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      status: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1,
        comment: '1 = active, 0 = inactive',
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

    await queryInterface.addIndex('lanes', ['plaza_id', 'number'], {
      unique: true,
      name: 'uq_lanes_plaza_number',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('lanes');
  },
};
