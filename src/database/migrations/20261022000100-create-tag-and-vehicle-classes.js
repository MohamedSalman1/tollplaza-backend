'use strict';

// Reference data from the dashboard (bbai/index.html: TAG_CLASS_INFO,
// VEHICLE_CLASS_NAME, DEFAULT_PRICING). Inserted here rather than in a
// seeder because plaza_pricing gets a foreign key to vehicle_classes below,
// and seeders run after every migration.
const TAG_CLASSES = [
  [4, 'Car / Jeep / Van / TATA Ace and similar mini LCV'],
  [5, 'Light Commercial Vehicle'],
  [6, 'Three Axle Commercial Vehicle'],
  [7, 'Bus / Truck (2-axle)'],
  [12, '4 to 6 Axle'],
  [15, '7 or More Axle'],
  [16, 'Heavy Construction Machinery'],
];

// [vehicle_class, name, tag_class, default single-journey price in rupees]
const VEHICLE_CLASSES = [
  [4, 'Car / Jeep / Van', 4, 65],
  [20, 'TATA Ace and similar mini LCV', 4, 105],
  [5, 'Light Commercial Vehicle 2-axle', 5, 105],
  [9, 'Mini-Bus', 5, 105],
  [6, 'Light Commercial Vehicle 3-axle', 6, 235],
  [8, 'Bus 3-axle', 6, 235],
  [11, 'Truck 3-axle', 6, 235],
  [7, 'Bus 2-axle', 7, 215],
  [10, 'Truck 2-axle', 7, 215],
  [12, 'Truck 4-Axle', 12, 340],
  [13, 'Truck 5-Axle', 12, 340],
  [14, 'Truck 6-Axle', 12, 340],
  [15, 'Truck Multi Axle (7 and Above)', 15, 410],
  [16, 'Earth Moving Machinery', 16, 340],
  [17, 'Heavy Construction Machinery', 16, 340],
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const timestamps = {
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
    };

    await queryInterface.createTable('tag_classes', {
      tag_class: {
        type: Sequelize.TINYINT,
        primaryKey: true,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      ...timestamps,
    });

    await queryInterface.createTable('vehicle_classes', {
      vehicle_class: {
        type: Sequelize.TINYINT,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      tag_class: {
        type: Sequelize.TINYINT,
        allowNull: false,
        references: { model: 'tag_classes', key: 'tag_class' },
        comment: 'The FASTag class this vehicle class is charged under',
      },
      default_price: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment:
          'Default single-journey tariff (whole rupees), used to seed a new plaza; each plaza has its own in plaza_pricing',
      },
      ...timestamps,
    });

    await queryInterface.bulkInsert(
      'tag_classes',
      TAG_CLASSES.map(([tag_class, description]) => ({
        tag_class,
        description,
      })),
    );
    await queryInterface.bulkInsert(
      'vehicle_classes',
      VEHICLE_CLASSES.map(
        ([vehicle_class, name, tag_class, default_price]) => ({
          vehicle_class,
          name,
          tag_class,
          default_price,
        }),
      ),
    );

    // Prices can only be set for known vehicle classes. Not added on
    // crossings: the feed sends classes outside the table (e.g. 1, 3, 18),
    // which are stored and charged 0, as in the dashboard.
    await queryInterface.addConstraint('plaza_pricing', {
      fields: ['vehicle_class'],
      type: 'foreign key',
      name: 'fk_plaza_pricing_vehicle_class',
      references: { table: 'vehicle_classes', field: 'vehicle_class' },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'plaza_pricing',
      'fk_plaza_pricing_vehicle_class',
    );
    await queryInterface.dropTable('vehicle_classes');
    await queryInterface.dropTable('tag_classes');
  },
};
