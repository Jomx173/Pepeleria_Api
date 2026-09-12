const { Op, Sequelize } = require("sequelize");
const { getInstance } = require("../config/database");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Movement = require("../models/Movement");
const generateProductCode = require("../utils/generateProductCode");

const sequelize = getInstance();

const getEstado = (cantidad, stockMinimo) => {
  if (cantidad === 0) return "agotado";
  if (cantidad <= stockMinimo) return "stock_bajo";
  return "en_stock";
};

const serializeProduct = (product) => {
  const p = product.toJSON();
  const estado = getEstado(p.cantidad, p.stock_minimo);
  return {
    id: p.id,
    nombre: p.nombre,
    cantidad: p.cantidad,
    stock_minimo: p.stock_minimo,
    estado,
    stockBajo: estado !== "en_stock",
    precio: p.precio,
    categoria_id: p.categoria_id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    categoria: p.category ? p.category.nombre : null,
    stockBajo: estado !== "en_stock",
  };
};

const withCategory = {
  model: Category,
  as: "category",
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({ include: withCategory, order: [["nombre", "ASC"]] });
    res.status(200).json(products.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos", error: err.message });
  }
};

const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, { include: withCategory });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    res.status(200).json(serializeProduct(product));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener el producto", error: err.message });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: {
        [Op.or]: [{ cantidad: { [Op.lt]: Sequelize.col("stock_minimo") } }, { cantidad: 0 }],
      },
      include: withCategory,
      order: [["cantidad", "ASC"]],
    });
    res.status(200).json(products.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos con stock bajo", error: err.message });
  }
};

const validateProductData = (body) => {
  const { nombre, cantidad, precio, categoria_id, stock_minimo } = body;

  if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "El campo 'nombre' es obligatorio" };
  }
  if (cantidad === undefined || cantidad === null || typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad < 0) {
    return { error: "El campo 'cantidad' debe ser un número entero no negativo" };
  }
  if (precio === undefined || precio === null || typeof precio !== "number" || isNaN(precio) || precio <= 0) {
    return { error: "El campo 'precio' debe ser un número mayor a 0" };
  }
  if (
    categoria_id === undefined ||
    categoria_id === null ||
    typeof categoria_id !== "number" ||
    !Number.isInteger(categoria_id)
  ) {
    return { error: "El campo 'categoria_id' es obligatorio" };
  }
  if (
    stock_minimo !== undefined &&
    stock_minimo !== null &&
    (typeof stock_minimo !== "number" || !Number.isInteger(stock_minimo) || stock_minimo < 0)
  ) {
    return { error: "El campo 'stock_minimo' debe ser un número entero no negativo" };
  }

  return {
    data: {
      nombre: nombre.trim(),
      cantidad,
      precio,
      categoria_id,
      stock_minimo: stock_minimo === undefined || stock_minimo === null ? 5 : stock_minimo,
    },
  };
};

const createProduct = async (req, res) => {
  let t;
  try {
    const { error, data } = validateProductData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const codigo = await generateProductCode(data.categoria_id);
    t = await sequelize.transaction();
    const product = await Product.create({ ...data, codigo }, { transaction: t });
    if (data.cantidad > 0) {
      await Movement.create(
        {
          producto_id: product.id,
          tipo: "entrada",
          cantidad: data.cantidad,
          stock_anterior: 0,
          stock_actual: data.cantidad,
          motivo: "Inventario inicial",
        },
        { transaction: t }
      );
    }
    await t.commit();
    const estado = getEstado(data.cantidad, data.stock_minimo);
    res.status(201).json({
      id: product.id,
      nombre: data.nombre,
      cantidad: data.cantidad,
      stock_minimo: data.stock_minimo,
      estado,
      stockBajo: estado !== "en_stock",
      precio: data.precio,
      categoria_id: data.categoria_id,
    });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({ message: "La categoría indicada no existe" });
    }
    res.status(500).json({ message: "Error al crear el producto", error: err.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { error, data } = validateProductData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const [affectedRows] = await Product.update(data, { where: { id } });
    if (affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    const product = await Product.findByPk(id, { include: withCategory });
    res.status(200).json(serializeProduct(product));
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({ message: "La categoría indicada no existe" });
    }
    res.status(500).json({ message: "Error al actualizar el producto", error: err.message });
  }
};

const deleteProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    await Movement.destroy({ where: { producto_id: id }, transaction: t });
    await product.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Producto eliminado" });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al eliminar el producto", error: err.message });
  }
};

const adjustProductsStock = async (req, res) => {
  const { items, motivo } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Debes indicar al menos un producto para ajustar" });
  }
  if (motivo !== undefined && motivo !== null && typeof motivo !== "string") {
    return res.status(400).json({ message: "El campo 'motivo' debe ser un texto" });
  }

  const validTipos = ["aumentar", "disminuir", "establecer"];
  for (const item of items) {
    if (
      item.producto_id === undefined ||
      item.producto_id === null ||
      typeof item.producto_id !== "number" ||
      !Number.isInteger(item.producto_id) ||
      item.producto_id <= 0
    ) {
      return res.status(400).json({ message: "Cada producto debe incluir un 'producto_id' válido" });
    }
    if (!validTipos.includes(item.tipo)) {
      return res.status(400).json({ message: "El campo 'tipo' debe ser 'aumentar', 'disminuir' o 'establecer'" });
    }
    if (
      item.cantidad === undefined ||
      item.cantidad === null ||
      typeof item.cantidad !== "number" ||
      !Number.isInteger(item.cantidad) ||
      item.cantidad < 0 ||
      (item.tipo !== "establecer" && item.cantidad <= 0)
    ) {
      return res.status(400).json({
        message:
          item.tipo === "establecer"
            ? "La cantidad a establecer debe ser un número entero no negativo"
            : "La cantidad debe ser un número entero mayor a 0",
      });
    }
  }

  const t = await sequelize.transaction();
  try {
    const ajustados = [];
    for (const item of items) {
      const product = await Product.findByPk(item.producto_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        include: [withCategory],
      });
      if (!product) {
        await t.rollback();
        return res.status(400).json({ message: "Alguno de los productos seleccionados no existe" });
      }

      const stockAnterior = product.cantidad;
      let cantidad = 0;
      if (item.tipo === "aumentar") {
        cantidad = item.cantidad;
      } else if (item.tipo === "disminuir") {
        cantidad = -item.cantidad;
      } else {
        cantidad = item.cantidad - stockAnterior;
      }

      const nuevoStock = stockAnterior + cantidad;
      if (nuevoStock < 0) {
        await t.rollback();
        return res.status(400).json({
          message: "No se puede disminuir esa cantidad porque el stock resultaría negativo.",
        });
      }

      const movement = await Movement.create(
        {
          producto_id: product.id,
          tipo: "ajuste",
          cantidad,
          stock_anterior: stockAnterior,
          stock_actual: nuevoStock,
          motivo: motivo ?? "Ajuste de inventario",
        },
        { transaction: t }
      );

      product.cantidad = nuevoStock;
      await product.save({ transaction: t });

      ajustados.push({ producto: serializeProduct(product), movimiento: movement.toJSON() });
    }

    await t.commit();
    res.status(200).json({
      message: `Stock ajustado correctamente en ${ajustados.length} producto${ajustados.length === 1 ? "" : "s"}`,
      productos: ajustados.map((a) => a.producto),
      ajustes: ajustados.map((a) => ({
        producto_id: a.producto.id,
        cantidad: a.movimiento.cantidad,
        stock_anterior: a.movimiento.stock_anterior,
        stock_actual: a.movimiento.stock_actual,
        estado: a.producto.estado,
      })),
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al ajustar el stock", error: err.message });
  }
};

const searchProducts = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || typeof q !== "string" || q.trim() === "") {
      return res.status(400).json({ message: "El parámetro 'q' es obligatorio" });
    }
    const searchTerm = q.trim().toLowerCase();
    const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const products = await Product.findAll({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: `%${searchTerm}%` } },
          { nombre: { [Op.like]: `%${searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1)}%` } },
        ],
      },
      include: withCategory,
      order: [["nombre", "ASC"]],
      limit: lim,
    });
    res.status(200).json(products.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ message: "Error al buscar productos", error: err.message });
  }
};

const validateCreaoData = (body) => {
  const { nombre, cantidad, precio, categoria_id, stock_minimo } = body;

  if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "El campo 'nombre' es obligatorio" };
  }
  if (cantidad === undefined || cantidad === null || typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "El campo 'cantidad' debe ser un número entero mayor a 0" };
  }
  if (precio === undefined || precio === null || typeof precio !== "number" || isNaN(precio) || precio <= 0) {
    return { error: "El campo 'precio' debe ser un número mayor a 0" };
  }
  if (
    categoria_id !== undefined &&
    categoria_id !== null &&
    (typeof categoria_id !== "number" || !Number.isInteger(categoria_id))
  ) {
    return { error: "El campo 'categoria_id' debe ser un número entero" };
  }
  if (
    stock_minimo !== undefined &&
    stock_minimo !== null &&
    (typeof stock_minimo !== "number" || !Number.isInteger(stock_minimo) || stock_minimo < 0)
  ) {
    return { error: "El campo 'stock_minimo' debe ser un número entero no negativo" };
  }

  return {
    data: {
      nombre: nombre.trim(),
      cantidad,
      precio,
      categoria_id: categoria_id ?? null,
      stock_minimo: stock_minimo === undefined || stock_minimo === null ? 5 : stock_minimo,
    },
  };
};

const creaoUpsertProduct = async (req, res) => {
  const apiKey = req.headers["x-creao-key"];
  const expectedKey = process.env.CREAO_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return res.status(401).json({ message: "No autorizado: API key inválida" });
  }

  const { error, data } = validateCreaoData(req.body);
  if (error) {
    return res.status(400).json({ message: error });
  }

  const { confirmado = false, actualizar_precio = false } = req.body;
  const { nombre, cantidad, precio, categoria_id, stock_minimo } = data;

  try {
    const existing = await Product.findOne({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: nombre } },
          { nombre: { [Op.like]: nombre.charAt(0).toUpperCase() + nombre.slice(1) } },
        ],
      },
      include: withCategory,
    });

    if (!existing) {
      const codigo = await generateProductCode(categoria_id);
      const preview = {
        accion: "crear",
        preview: {
          producto: nombre,
          cantidad_inicial: cantidad,
          precio,
          total: cantidad * precio,
          codigo_estimado: codigo,
          categoria_id: categoria_id ?? null,
          stock_minimo,
        },
        mensaje: `Producto nuevo. Se creará con ${cantidad} unidades de entrada inicial.`,
      };
      if (!confirmado) {
        return res.status(200).json(preview);
      }

      let t;
      try {
        t = await sequelize.transaction();
        const product = await Product.create(
          { ...data, codigo },
          { transaction: t }
        );
        await Movement.create(
          {
            producto_id: product.id,
            tipo: "entrada",
            cantidad,
            stock_anterior: 0,
            stock_actual: cantidad,
            motivo: "Inventario inicial (CREAO)",
          },
          { transaction: t }
        );
        await t.commit();
        const estado = getEstado(cantidad, stock_minimo);
        return res.status(201).json({
          ok: true,
          accion: "crear",
          producto: {
            id: product.id,
            nombre: product.nombre,
            codigo: product.codigo,
            cantidad: product.cantidad,
            stock_minimo: product.stock_minimo,
            estado,
            stockBajo: estado !== "en_stock",
            precio: product.precio,
            categoria_id: product.categoria_id,
            created_at: product.created_at,
            updated_at: product.updated_at,
            categoria: product.category ? product.category.nombre : null,
          },
          movimiento: {
            tipo: "entrada",
            cantidad,
            stock_anterior: 0,
            stock_actual: cantidad,
            motivo: "Inventario inicial (CREAO)",
          },
          mensaje: `Producto creado. Stock inicial: ${cantidad}`,
        });
      } catch (err) {
        if (t) await t.rollback().catch(() => {});
        throw err;
      }
    }

    const stockActual = existing.cantidad;
    const precioActual = Number(existing.precio);
    const precioNuevo = Number(precio);
    const mismaCantidad = existing.categoria_id === categoria_id;
    const precioDiferente = precioActual !== precioNuevo;

    const preview = {
      accion: "entrada",
      existencia_actual: stockActual,
      precio_actual: precioActual,
      precio_nuevo: precioNuevo,
      entrada: cantidad,
      nueva_existencia: stockActual + cantidad,
      categoria_actual: existing.categoria_id,
      categoria_nueva: categoria_id,
      misma_categoria: mismaCantidad,
      producto: serializeProduct(existing),
    };

    if (precioDiferente && !actualizar_precio) {
      preview.advertencia_precio = `El producto "${existing.nombre}" actualmente tiene precio L.${precioActual.toFixed(2)} y estás indicando L.${precioNuevo.toFixed(2)}. ¿Quieres actualizar el precio además de agregar las ${cantidad} unidades?`;
      preview.requiere_confirmacion_precio = true;
      if (!confirmado) {
        return res.status(200).json(preview);
      }
      return res.status(400).json({
        message: "Precio diferente al actual. Envía 'actualizar_precio: true' para confirmar el cambio de precio.",
        ...preview,
      });
    }

    if (!confirmado) {
      preview.mensaje = `Se registrará entrada de ${cantidad} unidades. Stock: ${stockActual} → ${stockActual + cantidad}${precioDiferente ? `. Precio se actualizará a L.${precioNuevo.toFixed(2)}` : ""}.`;
      return res.status(200).json(preview);
    }

    let t;
    try {
      t = await sequelize.transaction();
      const product = await Product.findByPk(existing.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        include: [withCategory],
      });
      if (!product) {
        await t.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      const stockAnterior = product.cantidad;
      const nuevoStock = stockAnterior + cantidad;

      const updateData = { cantidad: nuevoStock };
      if (precioDiferente && actualizar_precio) {
        updateData.precio = precioNuevo;
      }
      if (categoria_id !== null && categoria_id !== existing.categoria_id) {
        updateData.categoria_id = categoria_id;
      }
      if (stock_minimo !== undefined && stock_minimo !== existing.stock_minimo) {
        updateData.stock_minimo = stock_minimo;
      }

      await product.update(updateData, { transaction: t });

      const movement = await Movement.create(
        {
          producto_id: product.id,
          tipo: "entrada",
          cantidad,
          stock_anterior: stockAnterior,
          stock_actual: nuevoStock,
          motivo: `Entrada registrada por CREAO${precioDiferente && actualizar_precio ? " (con actualización de precio)" : ""}`,
        },
        { transaction: t }
      );

      await t.commit();

      const estado = getEstado(nuevoStock, product.stock_minimo);
      return res.status(200).json({
        ok: true,
        accion: "entrada",
        producto: {
          id: product.id,
          nombre: product.nombre,
          codigo: product.codigo,
          cantidad: product.cantidad,
          stock_minimo: product.stock_minimo,
          estado,
          stockBajo: estado !== "en_stock",
          precio: product.precio,
          categoria_id: product.categoria_id,
          created_at: product.created_at,
          updated_at: product.updated_at,
          categoria: product.category ? product.category.nombre : null,
        },
        movimiento: {
          id: movement.id,
          tipo: movement.tipo,
          cantidad: movement.cantidad,
          stock_anterior: movement.stock_anterior,
          stock_actual: movement.stock_actual,
          motivo: movement.motivo,
          created_at: movement.created_at,
        },
        mensaje: `Entrada registrada. Stock anterior: ${stockAnterior} → Nuevo stock: ${nuevoStock}${precioDiferente && actualizar_precio ? `. Precio actualizado a L.${precioNuevo.toFixed(2)}` : ""}`,
      });
    } catch (err) {
      if (t) await t.rollback().catch(() => {});
      throw err;
    }
  } catch (err) {
    res.status(500).json({ message: "Error en operación CREAO", error: err.message });
  }
};

module.exports = {
  getProducts,
  getProduct,
  getLowStockProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustProductsStock,
  searchProducts,
  creaoUpsertProduct,
};