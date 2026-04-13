using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

WebApplication app = builder.Build();
app.MapGet("/", () => "Muonroi.BuildingBlock sample");

await app.RunAsync();
