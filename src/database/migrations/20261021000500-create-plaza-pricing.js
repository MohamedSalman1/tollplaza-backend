'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Current prices only. Each crossing stores the price it was charged at,
    // so a change here affects future crossings only.
    await queryInterface.createTable('plaza_pricing', {
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
      vehicle_class: {
        type: Sequelize.TINYINT,
        allowNull: false,
      },
      price: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Whole rupees',
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
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

    await queryInterface.addIndex(
      'plaza_pricing',
      ['plaza_id', 'vehicle_class'],
      {
        unique: true,
        name: 'uq_plaza_pricing_plaza_class',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plaza_pricing');
  },
};
