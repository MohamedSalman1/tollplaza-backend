'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // The feed has colours like "Dual-tone: Beige/Off-white and Dark Grey"
  // (up to 73 characters), longer than the original 32.
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('crossings', 'vehicle_color', {
      type: Sequelize.STRING(96),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('crossings', 'vehicle_color', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
  },
};
