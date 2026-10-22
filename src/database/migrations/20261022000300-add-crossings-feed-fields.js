'use strict';

// Fields the crossing feed sends that weren't stored before. Kept as sent
// (their meaning isn't documented by the camera service). Rows ingested
// before this migration are backfilled from the feed dump by a one-off
// script, not here.
const COLUMNS = {
  government_class: { length: 64, comment: 'Raw from the feed' },
  special_class: {
    length: 64,
    comment: 'Raw from the feed, e.g. ambulance / transport / police',
  },
  clean: { length: 8, comment: 'Raw feed flag (e.g. "Y")' },
  clean2: { length: 8, comment: 'Raw feed flag (e.g. "Y")' },
  clean3: { length: 8, comment: 'Raw feed flag (e.g. "Y")' },
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [name, { length, comment }] of Object.entries(COLUMNS)) {
      await queryInterface.addColumn('crossings', name, {
        type: Sequelize.STRING(length),
        allowNull: true,
        comment,
      });
    }
  },

  async down(queryInterface) {
    for (const name of Object.keys(COLUMNS)) {
      await queryInterface.removeColumn('crossings', name);
    }
  },
};
