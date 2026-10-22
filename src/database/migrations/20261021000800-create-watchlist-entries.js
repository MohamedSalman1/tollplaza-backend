'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Shared watchlist (replaces each browser's localStorage list). Matched
    // against crossings on plate_normalized at read time, so there is no
    // hits table. plaza_id NULL = applies to every plaza.
    await queryInterface.createTable('watchlist_entries', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      plaza_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'plazas', key: 'id' },
        comment: 'NULL = all plazas',
      },
      plate_normalized: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      plate_display: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(16),
        allowNull: false,
        comment: 'stolen | bolo | blacklisted | vip | custom',
      },
      note: {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      added_by: {
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

    // NULL plaza_ids don't collide in a unique index, so the service also
    // checks for duplicate all-plaza entries
    await queryInterface.addIndex(
      'watchlist_entries',
      ['plaza_id', 'plate_normalized'],
      { unique: true, name: 'uq_watchlist_plaza_plate' },
    );
    await queryInterface.addIndex('watchlist_entries', ['plate_normalized'], {
      name: 'ix_watchlist_plate',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('watchlist_entries');
  },
};
