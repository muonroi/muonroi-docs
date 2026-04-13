using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;
using Microsoft.Extensions.Caching.Memory;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

IServiceCollection services = builder.Services;
services.AddMemoryCache();
services.AddMultiLevelCaching(configuration);
services.AddTransient<MultipleCacheExampleService>();

WebApplication app = builder.Build();
app.MapGet("/local", (MultipleCacheExampleService svc) => svc.GetMemoryData());
app.MapGet("/distributed", async (MultipleCacheExampleService svc) => await svc.GetDistributedDataAsync());

await app.RunAsync();
