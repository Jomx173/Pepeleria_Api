const sequelize = require("../config/database");
const Movement = require("../models/Movement");
const Product = require("../models/Product");
const Category = require("../models/Category");

const serializeMovement = (movement) => {
  const m = movement.toJSON();
  return {
    id: m.id,
    producto_id: m.producto_id,
    tipo: m.tipo,
    cantidad: m.cantidad,
    motivo: m.motivo ?? null,
    created_at: m.created_at,
    producto: m.product ? m.product.nombre : null,
  };
};

const serializeProduct = (product) => {
  const p = product.toJSON();
  return {
    id: p.id,
    nombre: p.nombre,
    cantidad: p.cantidad,
    precio: p.precio,
    categoria_id: p.categoria_id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    categoria: p.category ? p.category.nombre : null,
    stockBajo: p.cantidad < 5,
  };
};

const efecto = (tipo, cantidad) =>
  tipo === "entrada" ? cantidad : -cantidad;

const isValidId = (id) => Number.isInteger(id) && id > 0;

const getMovements = async (req, res) => {
  try {
    const where = {};
    if (req.query.producto_id) {
      where.producto_id = req.query.producto_id;
    }
    const movements = await Movement.findAll({
      where,
      include: [{ model: Product, as: "product" }],
      order: [["created_at", "DESC"]],
    });
    res.status(200).json(movements.map(serializeMovement));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los movimientos", error: err.message });
  }
};

const createMovement = async (req, res) => {
  const { producto_id, tipo, cantidad, motivo } = req.body;

  if (producto_id === undefined || producto_id === null || typeof producto_id !== "number" || !Number.isInteger(producto_id)) {
    return res.status(400).json({ message: "El campo 'producto_id' es obligatorio y debe ser un número entero" });
  }
  if (tipo !== "entrada" && tipo !== "salida") {
    return res.status(400).json({ message: "El campo 'tipo' debe ser 'entrada' o 'salida'" });
  }
  if (cantidad === undefined || cantidad === null || typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ message: "El campo 'cantidad' debe ser un número entero mayor a 0" });
  }
  if (motivo !== undefined && motivo !== null && typeof motivo !== "string") {
    return res.status(400).json({ message: "El campo 'motivo' debe ser un texto" });
  }

  const existing = await Product.findByPk(producto_id);
  if (!existing) {
    return res.status(400).json({ message: "El producto indicado no existe" });
  }

  const t = await sequelize.transaction();

  try {
    const product = await Product.findByPk(producto_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ model: Category, as: "category" }],
    });

    if (tipo === "salida" && product.cantidad < cantidad) {
      await t.rollback();
      return res.status(400).json({ message: `Stock insuficiente (disponible: ${product.cantidad})` });
    }

    const movement = await Movement.create(
      {
        producto_id,
        tipo,
        cantidad,
        motivo: motivo ?? null,
      },
      { transaction: t }
    );

    const nuevaCantidad = tipo === "entrada" ? product.cantidad + cantidad : product.cantidad - cantidad;
    product.cantidad = nuevaCantidad;
    await product.save({ transaction: t });

    await t.commit();

    res.status(201).json({
      movement: serializeMovement(movement),
      product: serializeProduct(product),
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al registrar el movimiento", error: err.message });
  }
};

const updateMovement = async (req, res) => {
  const id = Number(req.params.id);
  if (!isValidId(id)) {
    return res.status(400).json({ message: "ID de movimiento inválido" });
  }

  const { producto_id, tipo, cantidad, motivo } = req.body;

  if (tipo !== undefined && tipo !== "entrada" && tipo !== "salida") {
    return res.status(400).json({ message: "El campo 'tipo' debe ser 'entrada' o 'salida'" });
  }
  if (
    cantidad !== undefined &&
    (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad <= 0)
  ) {
    return res.status(400).json({ message: "El campo 'cantidad' debe ser un número entero mayor a 0" });
  }
  if (producto_id !== undefined && typeof producto_id !== "number") {
    return res.status(400).json({ message: "El campo 'producto_id' debe ser un número" });
  }
  if (motivo !== undefined && motivo !== null && typeof motivo !== "string") {
    return res.status(400).json({ message: "El campo 'motivo' debe ser un texto" });
  }

  const t = await sequelize.transaction();

  try {
    const movement = await Movement.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!movement) {
      await t.rollback();
      return res.status(404).json({ message: "Movimiento no encontrado" });
    }

    const oldProductoId = movement.producto_id;
    const oldEfecto = efecto(movement.tipo, movement.cantidad);
    const newTipo = tipo ?? movement.tipo;
    const newCantidad = cantidad ?? movement.cantidad;
    const newProductoId = producto_id ?? oldProductoId;
    const newEfecto = efecto(newTipo, newCantidad);

    const ids = [...new Set([oldProductoId, newProductoId])];
    const products = await Product.findAll({
      where: { id: ids },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (products.length !== ids.length) {
      await t.rollback();
      return res.status(400).json({ message: "Alguno de los productos no existe" });
    }
    const prodMap = new Map(products.map((p) => [p.id, p]));

    if (newProductoId === oldProductoId) {
      const product = prodMap.get(oldProductoId);
      const nuevoStock = product.cantidad - oldEfecto + newEfecto;
      if (nuevoStock < 0) {
        await t.rollback();
        return res.status(400).json({
          message: `Stock insuficiente (disponible: ${product.cantidad})`,
        });
      }
      product.cantidad = nuevoStock;
      await product.save({ transaction: t });
    } else {
      const oldProduct = prodMap.get(oldProductoId);
      const oldStock = oldProduct.cantidad - oldEfecto;
      if (oldStock < 0) {
        await t.rollback();
        return res.status(400).json({ message: "No se puede editar: el stock del producto quedaría negativo" });
      }
      oldProduct.cantidad = oldStock;
      await oldProduct.save({ transaction: t });

      const newProduct = prodMap.get(newProductoId);
      const newStock = newProduct.cantidad + newEfecto;
      if (newStock < 0) {
        await t.rollback();
        return res.status(400).json({
          message: `Stock insuficiente en el nuevo producto (disponible: ${newProduct.cantidad})`,
        });
      }
      newProduct.cantidad = newStock;
      await newProduct.save({ transaction: t });
    }

    movement.tipo = newTipo;
    movement.cantidad = newCantidad;
    movement.producto_id = newProductoId;
    if (motivo !== undefined) {
      movement.motivo = motivo ?? null;
    }
    await movement.save({ transaction: t });

    const updated = await Movement.findByPk(id, {
      transaction: t,
      include: [{ model: Product, as: "product" }],
    });

    await t.commit();

    res.status(200).json({
      movement: serializeMovement(updated),
      product: serializeProduct(prodMap.get(newProductoId)),
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al editar el movimiento", error: err.message });
  }
};

const deleteMovement = async (req, res) => {
  const id = Number(req.params.id);
  if (!isValidId(id)) {
    return res.status(400).json({ message: "ID de movimiento inválido" });
  }

  const t = await sequelize.transaction();

  try {
    const movement = await Movement.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!movement) {
      await t.rollback();
      return res.status(404).json({ message: "Movimiento no encontrado" });
    }

    const product = await Product.findByPk(movement.producto_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ model: Category, as: "category" }],
    });
    if (!product) {
      await t.rollback();
      return res.status(400).json({ message: "El producto asociado no existe" });
    }

    const nuevoStock = product.cantidad - efecto(movement.tipo, movement.cantidad);
    if (nuevoStock < 0) {
      await t.rollback();
      return res.status(400).json({ message: "No se puede eliminar: el stock quedaría negativo" });
    }

    product.cantidad = nuevoStock;
    await product.save({ transaction: t });
    await movement.destroy({ transaction: t });

    await t.commit();

    res.status(200).json({
      movement: serializeMovement(movement),
      product: serializeProduct(product),
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al eliminar el movimiento", error: err.message });
  }
};

module.exports = {
  getMovements,
  createMovement,
  updateMovement,
  deleteMovement,
};