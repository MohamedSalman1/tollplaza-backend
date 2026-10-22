'use strict';

const PLAZA_CODE = 'nagpur-champa';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('plazas', [
      {
        code: PLAZA_CODE,
        name: 'Nagpur / Champa',
        timezone: 'Asia/Kolkata',
        home_state_codes: JSON.stringify(['MH', 'BH']),
        media_base_url:
          'https://alerts-us.blue-bird.ai/nagpur/uploads/rgHwgyZwe/',
        status: 1,
      },
    ]);

    const [[plaza]] = await queryInterface.sequelize.query(
      'SELECT id FROM plazas WHERE code = ?',
      { replacements: [PLAZA_CODE] },
    );

    // Start from the default tariff in vehicle_classes (inserted by the
    // create-tag-and-vehicle-classes migration)
    await queryInterface.sequelize.query(
      `INSERT INTO plaza_pricing (plaza_id, vehicle_class, price)
       SELECT ?, vehicle_class, default_price FROM vehicle_classes`,
      { replacements: [plaza.id] },
    );

    await queryInterface.bulkInsert(
      'lanes',
      [3, 4].map((number) => ({
        plaza_id: plaza.id,
        number,
        name: `Lane ${number}`,
      })),
    );
  },

  async down(queryInterface) {
    const [[plaza]] = await queryInterface.sequelize.query(
      'SELECT id FROM plazas WHERE code = ?',
      { replacements: [PLAZA_CODE] },
    );
    if (!plaza) return;

    await queryInterface.bulkDelete('lane_cameras', { plaza_id: plaza.id });
    await queryInterface.bulkDelete('lanes', { plaza_id: plaza.id });
    await queryInterface.bulkDelete('plaza_pricing', { plaza_id: plaza.id });
    await queryInterface.bulkDelete('plazas', { id: plaza.id });
  },
};
