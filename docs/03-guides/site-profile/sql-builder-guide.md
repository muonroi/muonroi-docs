---
title: SQL Builder Guide
sidebar_label: SQL Builder
sidebar_position: 7
---

# SQL Builder Guide

The `SiteSqlBuilder` is a specialized tool for generating site-aware raw SQL queries. It ensures that your Dapper queries use the correct database column names and aliases regardless of which site is currently active.

## Why Use SiteSqlBuilder?

Dapper's global type mapping (`SqlMapper.SetTypeMap`) is not suitable for multi-site applications because it affects all queries in a process. `SiteSqlBuilder` solves this by:
1.  **Per-Request Mapping**: Resolving column names based on the current `ISiteProfile`.
2.  **Explicit Aliasing**: Generating `"COLUMN_NAME AS PropertyName"` pairs so Dapper can map results to your C# objects automatically.
3.  **Schema Awareness**: Automatically filtering out columns that do not exist for a specific site.

## Selecting Columns

### Select() and SelectFrom()
These methods build a comma-separated list of column-to-property aliases. They automatically skip columns that have been removed for the current site via `HasColumn()`.

```csharp
// In your service
string columns = _sqlBuilder.Select("BookingNo", "ContainerNo", "CreatedAt");

// Default Site: "BOOKING_NO AS BookingNo, CONTAINER_NO AS ContainerNo, CREATED_AT AS CreatedAt"
// Site with ContainerNo removed: "BOOKING_NO AS BookingNo, CREATED_AT AS CreatedAt"

string sql = _sqlBuilder.SelectFrom("orders", "BookingNo", "ContainerNo");
// "SELECT BOOKING_NO AS BookingNo, CONTAINER_NO AS ContainerNo FROM orders"
```

### SelectWithExtras()
Use this when a site might have additional columns defined in its `ISiteColumnMap.ExtraColumns`.

```csharp
string columns = _sqlBuilder.SelectWithExtras("BookingNo", "ContainerNo");
// Bravo Site: "BOOKING_NO AS BookingNo, CONTAINER_NO AS ContainerNo, BRAVO_TRACKING_REF AS TrackingReference"
```

## Resolving Column Names

### Col() and ColOrNull()
Use `Col()` to get a site-specific column name for use in `WHERE` or `JOIN` clauses. Use `ColOrNull()` if you need to conditionally include a clause only if the column exists.

```csharp
string where = $"WHERE {_sqlBuilder.Col("BookingNo")} = @b";

var containerCol = _sqlBuilder.ColOrNull("ContainerNo");
if (containerCol != null) {
    sql += $" AND {containerCol} = @c";
}
```

## Marker Interpolation (`[[PropertyName]]`)

Marker interpolation is the preferred way to write complex SQL while maintaining site awareness. Any text wrapped in `[[ ]]` is replaced with the site's mapped column name.

### InterpolateMarkers() (Strict Mode)
Replaces `[[PropertyName]]` with the mapped column name. **Throws an exception** if the property references a removed column. Use this for `WHERE`, `JOIN`, and `GROUP BY` where a missing column is a logic error.

```csharp
string sql = _sqlBuilder.InterpolateMarkers("SELECT * FROM orders WHERE [[BookingNo]] = @b");
// Default Site: "SELECT * FROM orders WHERE BOOKING_NO = @b"
// TCI Site:     "SELECT * FROM orders WHERE TCI_BKG_EXT = @b"
```

### InterpolateMarkersSafe() (Fallback Mode)
Replaces missing columns with a fallback value (default is `NULL`) instead of throwing. This is safer for `SELECT` lists where you want the property in your DTO to be null if the column is missing.

```csharp
string sql = _sqlBuilder.InterpolateMarkersSafe("SELECT [[BookingNo]], [[ContainerNo]] FROM orders");
// Site with ContainerNo removed: "SELECT BOOKING_NO, NULL FROM orders"
```

:::danger WHERE Clause Risk
Do **not** use `InterpolateMarkersSafe` in a `WHERE` clause. If a column is missing, it will result in `WHERE NULL = @val`, which is always false and may lead to silent data loss or empty results.
:::

## Method Decision Table

| I need to... | Use this method | Why? |
| :--- | :--- | :--- |
| Build a SELECT clause | `Select()` | Filters removed columns automatically. |
| Include site-specific extras | `SelectWithExtras()` | Appends `ExtraColumns` to the list. |
| Get a single column name | `Col()` | Direct resolution for WHERE/JOIN. |
| Check if a column exists | `HasColumn()` | Boolean check before using a column. |
| Interpolate complex SQL | `InterpolateMarkers()` | Strict replacement, fails fast on errors. |
| Handle missing columns in SELECT | `InterpolateMarkersSafe()` | Replaces missing columns with `NULL`. |

## Complete Example

```csharp
public async Task<List<OrderDto>> GetOrdersAsync(string bookingNo)
{
    // 1. Build select list (handles renames + removals)
    string cols = _sqlBuilder.Select("Id", "BookingNo", "ContainerNo", "Status");
    
    // 2. Build where clause using markers (handles renames)
    string sql = $"""
        SELECT {cols} 
        FROM order_details 
        WHERE [[BookingNo]] = @bookingNo
        """;
    
    // 3. Resolve markers and execute
    string finalSql = _sqlBuilder.InterpolateMarkers(sql);
    return (await _dapper.QueryAsync<OrderDto>(finalSql, new { bookingNo })).ToList();
}
```

## Next Steps

- [Site Column Map Guide](site-column-map-guide.md) — How to define renames and removals.
- [DbContext & Entities](dbcontext-and-entity-configuration.md) — EF Core equivalent of mapping.
- [Service Overrides](service-override-patterns.md) — Customizing the logic that calls these queries.
